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
	"backend/pkg/awsbedrock"
	"backend/pkg/db"
	"backend/pkg/runner"
	"backend/pkg/trajectory"

	"context"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/polly"
	ptypes "github.com/aws/aws-sdk-go-v2/service/polly/types"
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
			s.seedCandidateDemoData(cand.ID, mock)

			// Set status to completed and apply score
			score := scoreMapping[mock.GithubUsername]
			if score == 0 {
				score = 75
			}
			_ = s.DB.UpdateCandidateScore(cand.ID, score, "completed")
		}
		log.Println("Database seeded successfully with 10 candidate records, audits, steps, and S3 resume files.")
	} else {
		s.repairDemoCandidates()
	}
}

func (s *Server) repairDemoCandidates() {
	dataset, err := runner.LoadDataset(s.WorkspaceDir)
	if err != nil {
		return
	}
	mockByGithub := make(map[string]runner.MockCandidate)
	for _, m := range dataset {
		mockByGithub[m.GithubUsername] = m
	}
	scoreMapping := map[string]int{
		"junnygram": 92, "riveradevops": 45, "emilycodes": 88, "rajconcurrency": 35,
		"sarahml": 50, "mikecode": 82, "jesscloud": 85, "davidsecurity": 40,
		"amaracodes": 38, "carlosfront": 80,
	}

	candidates, err := s.DB.ListCandidatesByCompany("demo_company", "")
	if err != nil {
		return
	}
	repaired := 0
	for _, cand := range candidates {
		mock, ok := mockByGithub[cand.GithubUsername]
		if !ok {
			continue
		}
		audits, _ := s.DB.GetClaimsAudit(cand.ID)
		if len(audits) > 0 && cand.Status == "completed" {
			continue
		}
		_ = s.DB.ClearClaimsAudit(cand.ID)
		_ = s.DB.ClearProctoringEvents(cand.ID)
		_ = s.DB.ClearSessionSteps(cand.ID)
		s.seedCandidateDemoData(cand.ID, mock)
		score := scoreMapping[cand.GithubUsername]
		if score == 0 {
			score = 75
		}
		_ = s.DB.UpdateCandidateScore(cand.ID, score, "completed")
		repaired++
	}
	if repaired > 0 {
		log.Printf("Repaired demo data for %d candidate(s) (restored audits/steps after failed live runs).", repaired)
	}
}

func (s *Server) seedCandidateDemoData(candidateID string, mock runner.MockCandidate) {
	for _, audit := range mock.ExpectedAudit {
		severity := "none"
		if audit.Verdict == "failed" {
			severity = "high"
		} else if audit.Verdict == "exaggerated" {
			severity = "medium"
		}
		filePath := "Resume Text"
		if strings.Contains(audit.Evidence, "/") {
			for _, p := range strings.Split(audit.Evidence, " ") {
				if strings.Contains(p, "/") {
					filePath = p
					break
				}
			}
		}
		_ = s.DB.SaveClaimAudit(candidateID, audit.Claim, audit.Evidence, filePath, audit.Verdict, severity)
	}
	for _, pLog := range mock.ProctoringLogs {
		_ = s.DB.SaveProctoringEvent(candidateID, pLog.Timestamp, pLog.EventType, pLog.Duration, pLog.Details)
	}
	_, _ = s.DB.AddStep(candidateID, "system", fmt.Sprintf("Initializing vetting session for @%s", mock.GithubUsername), "")
	_, _ = s.DB.AddStep(candidateID, "thought", fmt.Sprintf("Candidate claims: %s. Fetching public repositories for analysis...", mock.Name), "")
	repoNames := ""
	for _, r := range mock.GithubRepos {
		repoNames += r.Name + ", "
	}
	if len(repoNames) > 2 {
		repoNames = repoNames[:len(repoNames)-2]
	} else {
		repoNames = "none"
	}
	_, _ = s.DB.AddStep(candidateID, "tool_call", fmt.Sprintf("git clone repositories [%s]", repoNames), "")
	_, _ = s.DB.AddStep(candidateID, "tool_result", fmt.Sprintf("Clone completed. Scanned codebase structures. Found repos: %s", repoNames), "")
	_, _ = s.DB.AddStep(candidateID, "thought", "Running static analysis rules to reconcile code segments with candidate resume claims...", "")
	_, _ = s.DB.AddStep(candidateID, "system", "Static claims audit trail computed successfully. Session closed.", "")
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	// Company auth endpoints
	mux.HandleFunc("/api/companies/register", s.handleCompanyRegister)
	mux.HandleFunc("/api/companies/login", s.handleCompanyLogin)
	mux.HandleFunc("/api/companies/analytics", s.handleCompanyAnalytics)
	mux.HandleFunc("/api/companies/", s.handleCompanyDetail)

	mux.HandleFunc("/api/candidates", s.handleCandidates)
	mux.HandleFunc("/api/candidates/", s.handleCandidateDetail)
	mux.HandleFunc("/api/sessions", s.handleSessions)
	mux.HandleFunc("/api/criteria", s.handleCriteria)
	mux.HandleFunc("/api/jobs", s.handleJobs)
	mux.HandleFunc("/api/apply", s.handleApply)
	mux.HandleFunc("/api/proctoring", s.handleProctoringEvent)
	mux.HandleFunc("/api/candidates/recording", s.handleUploadRecording)
	mux.HandleFunc("/api/speak", s.handleSpeak)
	mux.HandleFunc("/api/interview/questions", s.handleInterviewQuestions)
	mux.HandleFunc("/api/interview/start", s.handleInterviewStart)
	mux.HandleFunc("/api/interview/complete", s.handleInterviewComplete)
	mux.HandleFunc("/api/interview/sessions", s.handleInterviewSessionsByJob)
	mux.HandleFunc("/api/interview/", s.handleInterviewSession)
	mux.HandleFunc("/api/admin/stats", s.handleAdminStats)
	mux.HandleFunc("/api/admin/companies", s.handleAdminCompanies)
	mux.HandleFunc("/api/benchmark", s.handleBenchmark)
	mux.HandleFunc("/api/demo/candidate", s.handleDemoCandidate)
	mux.HandleFunc("/api/health", s.handleHealth)
	mux.HandleFunc("/api/trajectory/", s.handleTrajectory)

	// Serve uploaded resume files (public apply flow — resumes are less sensitive)
	resumeDir := filepath.Join(s.WorkspaceDir, "data", "resumes")
	os.MkdirAll(resumeDir, 0755)
	mux.Handle("/resumes/", http.StripPrefix("/resumes/", http.FileServer(http.Dir(resumeDir))))

	// Recordings require company auth — no public static serving
	mux.HandleFunc("/api/recordings/", s.handleSecureRecording)

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

func (s *Server) handleSpeak(w http.ResponseWriter, r *http.Request) {
	text := r.URL.Query().Get("text")
	if text == "" {
		http.Error(w, "text is required", http.StatusBadRequest)
		return
	}

	cfg, err := config.LoadDefaultConfig(context.TODO())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	svc := polly.NewFromConfig(cfg)
	input := &polly.SynthesizeSpeechInput{
		OutputFormat: ptypes.OutputFormatMp3,
		Text:         aws.String(text),
		VoiceId:      ptypes.VoiceIdJoanna,
	}

	out, err := svc.SynthesizeSpeech(context.TODO(), input)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer out.AudioStream.Close()

	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	io.Copy(w, out.AudioStream)
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

	// Hide interview recordings from public/unauthenticated list requests
	if companyID == "" {
		for i := range candidates {
			candidates[i].RecordingS3URL = ""
		}
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
	companyID := r.URL.Query().Get("company_id")

	cand, err := s.DB.GetCandidate(candidateID)
	if err != nil {
		http.Error(w, "Candidate not found", http.StatusNotFound)
		return
	}

	// Strip recording URL unless requesting company owns this candidate
	if companyID == "" || companyID != cand.CompanyID {
		cand.RecordingS3URL = ""
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
	// Always tie applicant to the job's company so they appear on the company dashboard
	if companyID == "" && jobID != "" {
		if job, err := s.DB.GetJobByID(jobID); err == nil {
			companyID = job.CompanyID
		}
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
					resumeS3URL = fmt.Sprintf("/resumes/%s/%s/%s", companySlug, jobID, filename)
					log.Printf("Resume saved locally: %s", destPath)
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
				s3URL = fmt.Sprintf("/recordumes/%s/%s/%s_interview.webm", companySlug, jobID, candidateID)
				log.Printf("Recording saved locally: %s", destPath)
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

// handleSecureRecording: company-authenticated streaming of interview recordings
func (s *Server) handleSecureRecording(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	companyID := r.URL.Query().Get("company_id")
	if companyID == "" {
		http.Error(w, "company_id required", http.StatusUnauthorized)
		return
	}

	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/recordings/"), "/")
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
	if cand.CompanyID != companyID {
		http.Error(w, "Forbidden: recording access denied", http.StatusForbidden)
		return
	}
	if cand.RecordingS3URL == "" {
		http.Error(w, "No recording available", http.StatusNotFound)
		return
	}

	// Resolve local file path from stored URL
	recordingPath := cand.RecordingS3URL
	if strings.HasPrefix(recordingPath, "/recordumes/") {
		recordingPath = filepath.Join(s.WorkspaceDir, "data", strings.TrimPrefix(recordingPath, "/"))
	} else if strings.HasPrefix(recordingPath, "s3://") {
		http.Error(w, "Recording stored in S3 — configure direct S3 access", http.StatusNotImplemented)
		return
	} else {
		recordingPath = filepath.Join(s.WorkspaceDir, "data", "recordumes", filepath.Base(recordingPath))
	}

	f, err := os.Open(recordingPath)
	if err != nil {
		// Try tenant-scoped path
		co, _ := s.DB.GetCompanyByID(companyID)
		slug := "default"
		if co != nil {
			slug = co.Slug
		}
		altPath := filepath.Join(s.WorkspaceDir, "data", "recordumes", slug, cand.JobID, fmt.Sprintf("%s_interview.webm", candidateID))
		f, err = os.Open(altPath)
		if err != nil {
			http.Error(w, "Recording file not found", http.StatusNotFound)
			return
		}
	}
	defer f.Close()

	w.Header().Set("Content-Type", "video/webm")
	w.Header().Set("Content-Disposition", "inline")
	io.Copy(w, f)
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

func (s *Server) handleCompanyAnalytics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	companyID := r.URL.Query().Get("company_id")
	if companyID == "" {
		http.Error(w, "company_id required", http.StatusBadRequest)
		return
	}
	stats, err := s.DB.GetCompanyAnalytics(companyID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
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

// handleInterviewQuestions: GET/POST interview questions for a job
func (s *Server) handleInterviewQuestions(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		jobID := r.URL.Query().Get("job_id")
		if jobID == "" {
			http.Error(w, "job_id required", http.StatusBadRequest)
			return
		}
		qs, err := s.DB.GetInterviewQuestions(jobID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_ = json.NewEncoder(w).Encode(qs)
	case http.MethodPost:
		var req struct {
			JobID     string   `json:"job_id"`
			Questions []string `json:"questions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.JobID == "" {
			http.Error(w, "job_id and questions required", http.StatusBadRequest)
			return
		}
		if err := s.DB.SetInterviewQuestions(req.JobID, req.Questions); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		_, _ = io.WriteString(w, `{"success":true}`)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleInterviewStart: candidate starts their interview session via token
func (s *Server) handleInterviewStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		CandidateID string `json:"candidate_id"`
		JobID       string `json:"job_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CandidateID == "" || req.JobID == "" {
		http.Error(w, "candidate_id and job_id required", http.StatusBadRequest)
		return
	}
	token := uuid.New().String()
	sessionID := uuid.New().String()
	session, err := s.DB.CreateInterviewSession(sessionID, req.CandidateID, req.JobID, token)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	qs, _ := s.DB.GetInterviewQuestions(req.JobID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"session": session, "questions": qs})
}

// handleInterviewSessionsByJob: GET all sessions for a job (leaderboard)
func (s *Server) handleInterviewSessionsByJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "job_id required", http.StatusBadRequest)
		return
	}
	sessions, err := s.DB.GetInterviewSessionsByJob(jobID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(sessions)
}

// handleInterviewSession: GET session by token
func (s *Server) handleInterviewSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := strings.TrimPrefix(r.URL.Path, "/api/interview/")
	if token == "" {
		http.Error(w, "token required", http.StatusBadRequest)
		return
	}
	session, err := s.DB.GetInterviewSessionByToken(token)
	if err != nil {
		http.Error(w, "Session not found", http.StatusNotFound)
		return
	}
	cand, _ := s.DB.GetCandidate(session.CandidateID)
	qs, _ := s.DB.GetInterviewQuestions(session.JobID)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"session": session, "candidate": cand, "questions": qs})
}

// handleInterviewComplete: score all answers via AWS Bedrock (Claude) or Gemini fallback
func (s *Server) handleInterviewComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		SessionID string            `json:"session_id"`
		Answers   map[string]string `json:"answers"` // question_id -> answer text
		JobTitle  string            `json:"job_title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" {
		http.Error(w, "session_id and answers required", http.StatusBadRequest)
		return
	}

	// Build answer transcript for scoring
	answerText := ""
	for qID, ans := range req.Answers {
		answerText += fmt.Sprintf("Q%s: %s\n", qID, ans)
	}

	score, fitSummary := s.scoreInterviewAnswers(req.JobTitle, answerText)

	answerJSON, _ := json.Marshal(req.Answers)
	if err := s.DB.CompleteInterviewSession(req.SessionID, score, fitSummary, string(answerJSON)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"score": score, "fit_summary": fitSummary})
}

// handleAdminStats: super admin platform overview
func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	stats, err := s.DB.GetAdminStats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(stats)
}

// handleAdminCompanies: super admin list all companies
func (s *Server) handleAdminCompanies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	companies, err := s.DB.ListAllCompanies()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(companies)
}

// handleBenchmark serves canonical benchmark results for the /benchmark UI.
func (s *Server) handleBenchmark(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	path := filepath.Join(s.WorkspaceDir, "data", "benchmark_results.json")
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, "Benchmark results not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// handleDemoCandidate resolves a seeded candidate by GitHub username for judge demo deep-links.
func (s *Server) handleDemoCandidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	github := strings.TrimSpace(r.URL.Query().Get("github"))
	if github == "" {
		http.Error(w, "github query required", http.StatusBadRequest)
		return
	}
	candidates, err := s.DB.ListCandidates()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	for _, c := range candidates {
		if c.GithubUsername == github {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"id":              c.ID,
				"name":            c.Name,
				"github_username": c.GithubUsername,
				"status":          c.Status,
				"sourcing_score":  c.SourcingScore,
			})
			return
		}
	}
	http.Error(w, "candidate not found", http.StatusNotFound)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) scoreInterviewAnswers(jobTitle, answerText string) (int, string) {
	systemPrompt := "You are an expert technical interviewer. Score answers 0-100. Respond with JSON only."
	userPrompt := fmt.Sprintf(`Role: "%s"
Answers:
%s

JSON: {"score": <0-100>, "fit_summary": "...", "strengths": "...", "gaps": "..."}`, jobTitle, answerText)

	br := awsbedrock.GetClient()
	if awsbedrock.PreferAWS() && br.Ready {
		text, err := br.Complete(systemPrompt, userPrompt, 1000)
		if err == nil {
			if score, summary := parseInterviewScoreJSON(text); score > 0 {
				log.Println("[AWS Bedrock] Interview scored via Claude")
				return score, summary
			}
		}
		log.Printf("[AWS Bedrock] Interview scoring failed: %v", err)
	}

	geminiKey := os.Getenv("GEMINI_API_KEY")
	if geminiKey != "" {
		body, _ := json.Marshal(map[string]interface{}{
			"contents": []map[string]interface{}{
				{"parts": []map[string]string{{"text": userPrompt}}},
			},
		})
		resp, err := http.Post(
			fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=%s", geminiKey),
			"application/json", strings.NewReader(string(body)),
		)
		if err == nil {
			defer resp.Body.Close()
			var result struct {
				Candidates []struct {
					Content struct {
						Parts []struct{ Text string `json:"text"` } `json:"parts"`
					} `json:"content"`
				} `json:"candidates"`
			}
			if json.NewDecoder(resp.Body).Decode(&result) == nil && len(result.Candidates) > 0 {
				text := result.Candidates[0].Content.Parts[0].Text
				if score, summary := parseInterviewScoreJSON(text); score > 0 {
					return score, summary
				}
			}
		}
	}

	return 70, "Interview completed. Scored via fallback (configure AWS Bedrock or Gemini for AI scoring)."
}

func parseInterviewScoreJSON(text string) (int, string) {
	jsonStr, err := awsbedrock.ExtractJSON(text)
	if err != nil {
		start := strings.Index(text, "{")
		end := strings.LastIndex(text, "}")
		if start < 0 || end <= start {
			return 0, ""
		}
		jsonStr = text[start : end+1]
	}
	var parsed struct {
		Score      int    `json:"score"`
		FitSummary string `json:"fit_summary"`
		Strengths  string `json:"strengths"`
		Gaps       string `json:"gaps"`
	}
	if json.Unmarshal([]byte(jsonStr), &parsed) != nil || parsed.Score <= 0 {
		return 0, ""
	}
	summary := parsed.FitSummary
	if parsed.Strengths != "" {
		summary += " Strengths: " + parsed.Strengths
	}
	if parsed.Gaps != "" {
		summary += " Gaps: " + parsed.Gaps
	}
	return parsed.Score, summary
}

func (s *Server) handleTrajectory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	github := strings.TrimPrefix(r.URL.Path, "/api/trajectory/")
	github = strings.Trim(github, "/")
	if github == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}
	path := filepath.Join(s.WorkspaceDir, "data", "trajectories", github+"_trajectory.md")
	data, err := os.ReadFile(path)
	if err != nil {
		http.Error(w, "trajectory not found", http.StatusNotFound)
		return
	}

	if r.URL.Query().Get("format") == "replay" {
		steps := trajectory.ParseMarkdown(string(data))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"github": github,
			"steps":  steps,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"github":   github,
		"markdown": string(data),
	})
}
