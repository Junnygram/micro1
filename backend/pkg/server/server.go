package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"backend/pkg/agent"
	"backend/pkg/db"
	"backend/pkg/runner"

	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type Server struct {
	DB            *db.DB
	Agent         *agent.Agent
	BaselineAgent *agent.BaselineAgent
	WorkspaceDir  string
	S3Bucket      string
}

func NewServer(database *db.DB, ag *agent.Agent, bl *agent.BaselineAgent, workspace string) *Server {
	s3Bucket := os.Getenv("AWS_S3_BUCKET")
	if s3Bucket == "" {
		s3Bucket = "zarasourcing-resumes"
	}
	s := &Server{
		DB:            database,
		Agent:         ag,
		BaselineAgent: bl,
		WorkspaceDir:  workspace,
		S3Bucket:      s3Bucket,
	}
	s.autoSeedDatabase()
	return s
}

func (s *Server) autoSeedDatabase() {
	list, err := s.DB.ListCandidates()
	if err != nil {
		log.Printf("Error checking candidates count: %v", err)
		return
	}

	if len(list) == 0 {
		log.Println("Database is empty. Seeding candidates from dataset.json...")
		dataset, err := runner.LoadDataset(s.WorkspaceDir)
		if err != nil {
			log.Printf("Error loading dataset for seeding: %v", err)
			return
		}

		// Create resumes folder in sandbox if not exists
		resumeDir := filepath.Join(s.WorkspaceDir, "data", "resumes")
		os.MkdirAll(resumeDir, 0755)

		// Seeding job mapping based on candidate skillsets
		jobMapping := map[string]string{
			"junnygram":      "golang_job",
			"riveradevops":   "devops_job",
			"emilycodes":     "frontend_job",
			"rajconcurrency": "golang_job",
			"sarahml":        "ml_job",
			"mikecode":       "nodejs_job",
			"jesscloud":      "devops_job",
			"davidsecurity":  "security_job",
			"amaracodes":     "python_job",
			"carlosfront":    "frontend_job",
		}

		// Pre-computed scores based on expected audits
		scoreMapping := map[string]int{
			"junnygram":      92,
			"riveradevops":   45,
			"emilycodes":     88,
			"rajconcurrency": 35,
			"sarahml":        50,
			"mikecode":       82,
			"jesscloud":      85,
			"davidsecurity":  40,
			"amaracodes":     38,
			"carlosfront":    80,
		}

		for _, mock := range dataset {
			id := uuid.New().String()
			jobID := jobMapping[mock.GithubUsername]
			if jobID == "" {
				jobID = "golang_job"
			}

			// Generate mock resume PDF locally
			filename := fmt.Sprintf("%s_resume.pdf", id[:8])
			destPath := filepath.Join(resumeDir, filename)
			resumeText := fmt.Sprintf("Candidate: %s\nRole: %s\nEmail: %s\n\n%s", mock.Name, mock.Role, mock.Email, mock.Resume)
			_ = os.WriteFile(destPath, []byte(resumeText), 0644)

			resumeS3URL := fmt.Sprintf("s3://%s/%s", s.S3Bucket, filename)

			cand, err := s.DB.CreateCandidate(id, mock.Name, mock.Email, mock.Role, mock.GithubUsername, jobID, "demo_company", resumeS3URL)
			if err != nil {
				log.Printf("Error seeding candidate %s: %v", mock.Name, err)
				continue
			}

			// Seed Claims Audits
			for _, audit := range mock.ExpectedAudit {
				severity := "none"
				if audit.Verdict == "failed" {
					severity = "high"
				} else if audit.Verdict == "exaggerated" {
					severity = "medium"
				}
				
				// Infer file path
				filePath := "Resume Text"
				if strings.Contains(audit.Evidence, "/") {
					parts := strings.Split(audit.Evidence, " ")
					for _, p := range parts {
						if strings.Contains(p, "/") {
							filePath = p
							break
						}
					}
				}
				_ = s.DB.SaveClaimAudit(cand.ID, audit.Claim, audit.Evidence, filePath, audit.Verdict, severity)
			}

			// Seed Proctoring Events
			for _, pLog := range mock.ProctoringLogs {
				_ = s.DB.SaveProctoringEvent(cand.ID, pLog.Timestamp, pLog.EventType, pLog.Duration, pLog.Details)
			}

			// Seed Mock steps for pseudo-terminal logs
			_, _ = s.DB.AddStep(cand.ID, "system", fmt.Sprintf("Initializing vetting session for @%s", cand.GithubUsername), "")
			_, _ = s.DB.AddStep(cand.ID, "thought", fmt.Sprintf("Candidate claims: %s. Fetching public repositories for analysis...", cand.Name), "")
			
			repoNames := ""
			for _, r := range mock.GithubRepos {
				repoNames += r.Name + ", "
			}
			if len(repoNames) > 2 {
				repoNames = repoNames[:len(repoNames)-2]
			} else {
				repoNames = "none"
			}
			_, _ = s.DB.AddStep(cand.ID, "tool_call", fmt.Sprintf("git clone repositories [%s]", repoNames), "")
			_, _ = s.DB.AddStep(cand.ID, "tool_result", fmt.Sprintf("Clone completed. Scanned codebase structures. Found repos: %s", repoNames), "")
			_, _ = s.DB.AddStep(cand.ID, "thought", "Running static analysis rules to reconcile code segments with candidate resume claims...", "")
			_, _ = s.DB.AddStep(cand.ID, "system", "Static claims audit trail computed successfully. Session closed.", "")

			// Set status to completed and apply score
			score := scoreMapping[mock.GithubUsername]
			if score == 0 {
				score = 75
			}
			_ = s.DB.UpdateCandidateScore(cand.ID, score, "completed")
		}
		log.Println("Database seeded successfully with 10 candidate records, audits, steps, and S3 resume files.")
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Company auth endpoints
	mux.HandleFunc("/api/companies/register", s.handleCompanyRegister)
	mux.HandleFunc("/api/companies/login", s.handleCompanyLogin)
	mux.HandleFunc("/api/companies/", s.handleCompanyDetail)

	mux.HandleFunc("/api/candidates", s.handleCandidates)
	mux.HandleFunc("/api/candidates/", s.handleCandidateDetail)
	mux.HandleFunc("/api/sessions", s.handleSessions)
	mux.HandleFunc("/api/criteria", s.handleCriteria)
	mux.HandleFunc("/api/jobs", s.handleJobs)
	mux.HandleFunc("/api/apply", s.handleApply)
	mux.HandleFunc("/api/proctoring", s.handleProctoringEvent)
	mux.HandleFunc("/api/candidates/recording", s.handleUploadRecording)
	mux.HandleFunc("/api/session/realtime/", s.handleRealtimeSession)

	// Serve uploaded resume files
	resumeDir := filepath.Join(s.WorkspaceDir, "data", "resumes")
	os.MkdirAll(resumeDir, 0755)
	mux.Handle("/resumes/", http.StripPrefix("/resumes/", http.FileServer(http.Dir(resumeDir))))

	// Serve recorded interview videos
	recordingDir := filepath.Join(s.WorkspaceDir, "data", "recordumes")
	os.MkdirAll(recordingDir, 0755)
	mux.Handle("/recordumes/", http.StripPrefix("/recordumes/", http.FileServer(http.Dir(recordingDir))))

	// CORS wrapper
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		mux.ServeHTTP(w, r)
	})
}

func (s *Server) handleCandidates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.URL.Query().Get("company_id")
	jobID := r.URL.Query().Get("job_id")

	var candidates []db.Candidate
	var err error

	if companyID != "" {
		candidates, err = s.DB.ListCandidatesByCompany(companyID, jobID)
	} else {
		candidates, err = s.DB.ListCandidates()
		if err == nil && jobID != "" {
			var filtered []db.Candidate
			for _, c := range candidates {
				if c.JobID == jobID {
					filtered = append(filtered, c)
				}
			}
			candidates = filtered
		}
	}

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(candidates)
}

func (s *Server) handleCandidateDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/candidates/"), "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		http.Error(w, "Missing candidate ID", http.StatusBadRequest)
		return
	}

	candidateID := pathParts[0]

	cand, err := s.DB.GetCandidate(candidateID)
	if err != nil {
		http.Error(w, "Candidate not found", http.StatusNotFound)
		return
	}

	audits, err := s.DB.GetClaimsAudit(candidateID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	steps, err := s.DB.GetSessionSteps(candidateID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	proctoring, err := s.DB.GetProctoringEvents(candidateID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := map[string]interface{}{
		"candidate":  cand,
		"audits":     audits,
		"steps":      steps,
		"proctoring": proctoring,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(response)
}

func (s *Server) handleSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CandidateID string `json:"candidate_id"`
		Mode        string `json:"mode"` // "baseline" or "advanced"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cand, err := s.DB.GetCandidate(req.CandidateID)
	if err != nil {
		http.Error(w, "Candidate not found", http.StatusNotFound)
		return
	}

	// Update candidate status to evaluating
	_ = s.DB.UpdateCandidateScore(cand.ID, 0, "evaluating")
	_ = s.DB.ClearProctoringEvents(cand.ID)

	// Trigger agent in background
	if req.Mode == "advanced" {
		go func() {
			_ = s.Agent.StartSession(cand.ID, cand.GithubUsername)
			_ = s.reCalculateScores() // Apply criteria weights to the final score
		}()
	} else {
		go func() {
			_ = s.BaselineAgent.StartSession(cand.ID, cand.GithubUsername)
		}()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(cand)
}

func (s *Server) handleCriteria(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		companyID := r.URL.Query().Get("company_id")
		var criteria *db.SourcingCriteria
		var err error
		if companyID != "" {
			criteria, err = s.DB.GetCriteriaByCompany(companyID)
		} else {
			criteria, err = s.DB.GetCriteria()
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(criteria)

	case http.MethodPost:
		var req struct {
			WeightOpenSource  int    `json:"weight_open_source"`
			WeightCodeQuality int    `json:"weight_code_quality"`
			WeightExperience  int    `json:"weight_experience"`
			LlmModel          string `json:"llm_model"`
			CompanyID         string `json:"company_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		model := req.LlmModel
		if model == "" {
			model = "gemini"
		}

		sc := &db.SourcingCriteria{
			WeightOpenSource:  req.WeightOpenSource,
			WeightCodeQuality: req.WeightCodeQuality,
			WeightExperience:  req.WeightExperience,
			LlmModel:          model,
			CompanyID:         req.CompanyID,
		}

		var err error
		if req.CompanyID != "" {
			err = s.DB.UpdateCriteriaByCompany(sc)
		} else {
			err = s.DB.UpdateCriteria(sc)
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Recalculate scores for all evaluated candidates dynamically
		err = s.reCalculateScores()
		if err != nil {
			http.Error(w, "Re-scoring failed: "+err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"success":true}`)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleJobs: GET lists all jobs, POST creates a new job
func (s *Server) handleJobs(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		companyID := r.URL.Query().Get("company_id")
		var jobs []db.Job
		var err error
		if companyID != "" {
			jobs, err = s.DB.GetJobsByCompany(companyID)
		} else {
			jobs, err = s.DB.GetJobs()
		}
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(jobs)

	case http.MethodPost:
		var req struct {
			Title       string `json:"title"`
			Description string `json:"description"`
			CompanyID   string `json:"company_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.Title == "" || req.Description == "" {
			http.Error(w, "Title and description are required", http.StatusBadRequest)
			return
		}

		id := uuid.New().String()
		job, err := s.DB.CreateJob(id, req.Title, req.Description, req.CompanyID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		// Create a folder for this job description scoped by company
		companySlug := req.CompanyID
		if companySlug != "" {
			if co, err := s.DB.GetCompanyByID(companySlug); err == nil {
				companySlug = co.Slug
			}
		}
		jobFolder := filepath.Join(s.WorkspaceDir, "data", "jobs", companySlug, id)
		os.MkdirAll(jobFolder, 0755)

		// Save the JD as a markdown file inside the folder
		jdPath := filepath.Join(jobFolder, "job_description.md")
		jdContent := fmt.Sprintf("# %s\n\n%s\n", req.Title, req.Description)
		os.WriteFile(jdPath, []byte(jdContent), 0644)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(job)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleApply: multipart form-data for candidate applications with resume upload
func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (32MB max)
	err := r.ParseMultipartForm(32 << 20)
	if err != nil {
		http.Error(w, "Failed to parse form data: "+err.Error(), http.StatusBadRequest)
		return
	}

	name := r.FormValue("name")
	email := r.FormValue("email")
	github := r.FormValue("github_username")
	jobID := r.FormValue("job_id")
	role := r.FormValue("role")
	companyID := r.FormValue("company_id")

	if name == "" || email == "" || github == "" {
		http.Error(w, "Name, email, and GitHub username are required", http.StatusBadRequest)
		return
	}
	if jobID == "" {
		jobID = "default_job"
	}
	if role == "" {
		role = "Full-Stack Developer"
	}

	// Resolve company slug for S3 path
	companySlug := "default"
	if companyID != "" {
		if co, err := s.DB.GetCompanyByID(companyID); err == nil {
			companySlug = co.Slug
		}
	}

	candidateID := uuid.New().String()
	resumeS3URL := ""

	// Handle resume file upload
	file, handler, err := r.FormFile("resume")
	if err == nil {
		defer file.Close()

		// Tenant-scoped S3 key: company_slug/job_id/resumes/candidate_filename
		s3Key := fmt.Sprintf("%s/%s/resumes/%s_%s", companySlug, jobID, candidateID[:8], handler.Filename)

		// Attempt direct AWS S3 upload
		s3URL, uploadErr := s.uploadToS3(s3Key, file)
		if uploadErr == nil {
			resumeS3URL = s3URL
			log.Printf("Successfully uploaded resume to S3: %s", resumeS3URL)
		} else {
			log.Printf("S3 upload failed: %v. Falling back to local storage.", uploadErr)

			if seeker, ok := file.(io.ReadSeeker); ok {
				_, _ = seeker.Seek(0, io.SeekStart)
			}

			// Local fallback with tenant-scoped folder
			resumeDir := filepath.Join(s.WorkspaceDir, "data", "resumes", companySlug, jobID)
			os.MkdirAll(resumeDir, 0755)
			filename := fmt.Sprintf("%s_%s", candidateID[:8], handler.Filename)
			destPath := filepath.Join(resumeDir, filename)

			dst, err := os.Create(destPath)
			if err == nil {
				defer dst.Close()
				if _, err := io.Copy(dst, file); err == nil {
					resumeS3URL = fmt.Sprintf("s3://%s/%s", s.S3Bucket, s3Key)
					log.Printf("Resume saved locally (simulated S3): %s", resumeS3URL)
				}
			}
		}
	}

	cand, err := s.DB.CreateCandidate(candidateID, name, email, role, github, jobID, companyID, resumeS3URL)
	if err != nil {
		http.Error(w, "Failed to create candidate: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Set status to pending (not evaluating yet)
	_ = s.DB.UpdateCandidateScore(cand.ID, 0, "pending")

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(cand)
}

// uploadToS3 uploads a file reader stream directly to the configured AWS S3 bucket
func (s *Server) uploadToS3(filename string, file io.Reader) (string, error) {
	ctx := context.TODO()
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to load default AWS config: %w", err)
	}

	s3Client := s3.NewFromConfig(cfg)

	_, err = s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(s.S3Bucket),
		Key:    aws.String(filename),
		Body:   file,
	})
	if err != nil {
		return "", fmt.Errorf("failed to put object in S3 bucket: %w", err)
	}

	return fmt.Sprintf("s3://%s/%s", s.S3Bucket, filename), nil
}

// handleProctoringEvent: POST a live proctoring event from the frontend
func (s *Server) handleProctoringEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		CandidateID string `json:"candidate_id"`
		Timestamp   string `json:"timestamp"`
		EventType   string `json:"event_type"`
		Duration    int    `json:"duration"`
		Details     string `json:"details"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	err := s.DB.SaveProctoringEvent(req.CandidateID, req.Timestamp, req.EventType, req.Duration, req.Details)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_, _ = io.WriteString(w, `{"success":true}`)
}

func (s *Server) reCalculateScores() error {
	criteria, err := s.DB.GetCriteria()
	if err != nil {
		return err
	}

	candidates, err := s.DB.ListCandidates()
	if err != nil {
		return err
	}

	dataset, err := runner.LoadDataset(s.WorkspaceDir)
	if err != nil {
		return err
	}

	mockMap := make(map[string]*runner.MockCandidate)
	for i := range dataset {
		mockMap[dataset[i].GithubUsername] = &dataset[i]
	}

	for _, cand := range candidates {
		if cand.Status != "completed" {
			continue
		}

		audits, err := s.DB.GetClaimsAudit(cand.ID)
		if err != nil {
			continue
		}

		// Experience: start at 100, deduct for exaggerations
		expScore := 100
		// Code Quality: start at 100, deduct for failures
		cqScore := 100
		
		for _, audit := range audits {
			if audit.Status == "exaggerated" {
				expScore -= 30
			} else if audit.Status == "failed" {
				cqScore -= 45
			}
		}
		if expScore < 0 { expScore = 0 }
		if cqScore < 0 { cqScore = 0 }

		// Open Source: based on stars
		osScore := 50
		mock, ok := mockMap[cand.GithubUsername]
		if ok {
			totalStars := 0
			for _, r := range mock.GithubRepos {
				totalStars += r.Stars
			}
			if totalStars > 50 {
				osScore = 100
			} else if totalStars > 20 {
				osScore = 85
			} else if totalStars > 0 {
				osScore = 70
			}
		}

		// Calculate weighted score
		totalWeight := criteria.WeightOpenSource + criteria.WeightCodeQuality + criteria.WeightExperience
		if totalWeight == 0 {
			totalWeight = 100
		}
		
		weightedScore := (osScore*criteria.WeightOpenSource + cqScore*criteria.WeightCodeQuality + expScore*criteria.WeightExperience) / totalWeight
		if weightedScore > 100 { weightedScore = 100 }
		if weightedScore < 0 { weightedScore = 0 }

		_ = s.DB.UpdateCandidateScore(cand.ID, weightedScore, "completed")
	}

	return nil
}

// handleUploadRecording: processes candidate webcam interview recordings and uploads to S3
func (s *Server) handleUploadRecording(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form (50MB max video size)
	err := r.ParseMultipartForm(50 << 20)
	if err != nil {
		http.Error(w, "Failed to parse form: "+err.Error(), http.StatusBadRequest)
		return
	}

	candidateID := r.FormValue("candidate_id")
	if candidateID == "" {
		http.Error(w, "Candidate ID is required", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("video")
	if err != nil {
		http.Error(w, "Video file is required: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Resolve company slug and job ID for tenant-scoped path
	companySlug := "default"
	jobID := "default_job"
	cand, candErr := s.DB.GetCandidate(candidateID)
	if candErr == nil {
		jobID = cand.JobID
		if cand.CompanyID != "" {
			if co, err := s.DB.GetCompanyByID(cand.CompanyID); err == nil {
				companySlug = co.Slug
			}
		}
	}

	// Tenant-scoped S3 key: company_slug/job_id/recordings/candidate_interview.webm
	s3Key := fmt.Sprintf("%s/%s/recordings/%s_interview.webm", companySlug, jobID, candidateID)

	// Upload directly to AWS S3
	s3URL, uploadErr := s.uploadToS3(s3Key, file)
	if uploadErr == nil {
		log.Printf("Successfully uploaded recording to S3: %s", s3URL)
	} else {
		log.Printf("S3 recording upload failed: %v. Saving locally.", uploadErr)

		if seeker, ok := file.(io.ReadSeeker); ok {
			_, _ = seeker.Seek(0, io.SeekStart)
		}

		// Save locally in tenant-scoped sandbox
		recordingDir := filepath.Join(s.WorkspaceDir, "data", "recordumes", companySlug, jobID)
		os.MkdirAll(recordingDir, 0755)
		destPath := filepath.Join(recordingDir, fmt.Sprintf("%s_interview.webm", candidateID))

		dst, err := os.Create(destPath)
		if err == nil {
			defer dst.Close()
			if _, err := io.Copy(dst, file); err == nil {
				s3URL = fmt.Sprintf("s3://%s/%s", s.S3Bucket, s3Key)
				log.Printf("Recording saved locally (simulated S3): %s", s3URL)
			}
		}
	}

	// Update candidate record in DB
	err = s.DB.UpdateCandidateRecording(candidateID, s3URL)
	if err != nil {
		http.Error(w, "Failed to update candidate recording URL: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_, _ = io.WriteString(w, `{"success":true}`)
}

func (s *Server) handleCompanyRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		http.Error(w, "Name, email, and password are required", http.StatusBadRequest)
		return
	}

	id := uuid.New().String()
	slug := strings.ToLower(strings.ReplaceAll(req.Name, " ", "-")) + "-" + id[:4]
	
	company, err := s.DB.CreateCompany(id, req.Name, slug, req.Email, req.Password)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(company)
}

func (s *Server) handleCompanyLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	company, err := s.DB.VerifyCompanyPassword(req.Email, req.Password)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(company)
}

func (s *Server) handleCompanyDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/companies/"), "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		http.Error(w, "Missing company ID", http.StatusBadRequest)
		return
	}

	companyID := pathParts[0]
	company, err := s.DB.GetCompanyByID(companyID)
	if err != nil {
		http.Error(w, "Company not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(company)
}
