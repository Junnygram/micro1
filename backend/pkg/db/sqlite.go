package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

type DB struct {
	*sql.DB
}

type Company struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	LogoURL      string    `json:"logo_url"`
	Plan         string    `json:"plan"`
	CreatedAt    time.Time `json:"created_at"`
}

type Job struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	CompanyID   string    `json:"company_id"`
	CreatedAt   time.Time `json:"created_at"`
}

type Candidate struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	GithubUsername string    `json:"github_username"`
	SourcingScore  int       `json:"sourcing_score"`
	Status         string    `json:"status"` // "evaluating", "completed", "failed"
	JobID          string    `json:"job_id"`
	CompanyID      string    `json:"company_id"`
	ResumeS3URL    string    `json:"resume_s3_url"`
	RecordingS3URL string    `json:"recording_s3_url"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type ClaimAudit struct {
	ID               int64     `json:"id"`
	CandidateID      string    `json:"candidate_id"`
	ClaimText        string    `json:"claim_text"`
	EvidenceText     string    `json:"evidence_text"`
	FilePath         string    `json:"file_path"`
	Status           string    `json:"status"`   // "verified", "exaggerated", "failed"
	Severity         string    `json:"severity"` // "high", "medium", "none"
	CreatedAt        time.Time `json:"created_at"`
}

type SourcingCriteria struct {
	ID                int64     `json:"id"`
	WeightOpenSource  int       `json:"weight_open_source"`
	WeightCodeQuality int       `json:"weight_code_quality"`
	WeightExperience  int       `json:"weight_experience"`
	LlmModel          string    `json:"llm_model"`
	CompanyID         string    `json:"company_id"`
	UpdatedAt         time.Time `json:"updated_at"`
}

type Step struct {
	ID        int64     `json:"id"`
	SessionID string    `json:"session_id"` // Maps to candidate_id
	Type      string    `json:"type"`       // "thought", "tool_call", "tool_result", "system", "user_feedback"
	Content   string    `json:"content"`
	Metadata  string    `json:"metadata"`
	CreatedAt time.Time `json:"created_at"`
}

type InterviewQuestion struct {
	ID         int64     `json:"id"`
	JobID      string    `json:"job_id"`
	Question   string    `json:"question"`
	OrderIndex int       `json:"order_index"`
	CreatedAt  time.Time `json:"created_at"`
}

type InterviewSession struct {
	ID            string    `json:"id"`
	CandidateID   string    `json:"candidate_id"`
	JobID         string    `json:"job_id"`
	Token         string    `json:"token"`
	Status        string    `json:"status"` // "pending", "in_progress", "completed"
	InterviewScore int      `json:"interview_score"`
	FitSummary    string    `json:"fit_summary"`
	Answers       string    `json:"answers"` // JSON blob
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type ProctoringEvent struct {
	ID          int64     `json:"id"`
	CandidateID string    `json:"candidate_id"`
	Timestamp   string    `json:"timestamp"`
	EventType   string    `json:"event_type"` // "look_away", "tab_switch", "voice_detected"
	Duration    int       `json:"duration"`
	Details     string    `json:"details"`
	CreatedAt   time.Time `json:"created_at"`
}

func InitDB(dbPath string) (*DB, error) {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create db directory: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	// Enable WAL mode
	if _, err := conn.Exec("PRAGMA journal_mode=WAL;"); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to enable WAL: %w", err)
	}

	db := &DB{conn}
	if err := db.migrateSchema(); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migration failed: %w", err)
	}

	// Try adding column llm_model if not present
	_, _ = db.Exec("ALTER TABLE sourcing_criteria ADD COLUMN llm_model TEXT DEFAULT 'gemini'")

	return db, nil
}

func (db *DB) migrateSchema() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS companies (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			slug TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL,
			password_hash TEXT NOT NULL,
			logo_url TEXT DEFAULT '',
			plan TEXT DEFAULT 'free',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS jobs (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			description TEXT NOT NULL,
			company_id TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS candidates (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			email TEXT NOT NULL,
			role TEXT NOT NULL,
			github_username TEXT NOT NULL,
			sourcing_score INTEGER DEFAULT 0,
			status TEXT NOT NULL,
			job_id TEXT DEFAULT 'default_job',
			company_id TEXT DEFAULT '',
			resume_s3_url TEXT DEFAULT '',
			recording_s3_url TEXT DEFAULT '',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (job_id) REFERENCES jobs(id)
		);`,
		`CREATE TABLE IF NOT EXISTS claims_audit (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			candidate_id TEXT NOT NULL,
			claim_text TEXT NOT NULL,
			evidence_text TEXT NOT NULL,
			file_path TEXT NOT NULL,
			status TEXT NOT NULL,
			severity TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS sourcing_criteria (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			weight_open_source INTEGER DEFAULT 33,
			weight_code_quality INTEGER DEFAULT 33,
			weight_experience INTEGER DEFAULT 34,
			llm_model TEXT DEFAULT 'gemini',
			company_id TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS steps (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			type TEXT NOT NULL,
			content TEXT NOT NULL,
			metadata TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES candidates(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS interview_questions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			job_id TEXT NOT NULL,
			question TEXT NOT NULL,
			order_index INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS interview_sessions (
			id TEXT PRIMARY KEY,
			candidate_id TEXT NOT NULL,
			job_id TEXT NOT NULL,
			token TEXT NOT NULL UNIQUE,
			status TEXT DEFAULT 'pending',
			interview_score INTEGER DEFAULT 0,
			fit_summary TEXT DEFAULT '',
			answers TEXT DEFAULT '{}',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS proctoring_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			candidate_id TEXT NOT NULL,
			timestamp TEXT NOT NULL,
			event_type TEXT NOT NULL,
			duration INTEGER DEFAULT 0,
			details TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
		);`,
		// Seed default criteria row if empty
		`INSERT INTO sourcing_criteria (id, weight_open_source, weight_code_quality, weight_experience)
		 SELECT 1, 33, 33, 34 WHERE NOT EXISTS (SELECT 1 FROM sourcing_criteria WHERE id = 1);`,
		// Seed dynamic job openings matching the dataset profiles
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'golang_job', 'Senior Golang Backend Developer', 'Must have experience with Go, SQLite WAL mode, interfaces, and concurrency.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'golang_job');`,
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'frontend_job', 'Next.js & Tailwind UI Developer', 'Must have experience with React hooks, responsive CSS, and dynamic levers.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'frontend_job');`,
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'devops_job', 'DevOps & Cloud SRE', 'Must have experience with AWS S3, local sandboxes, and pipeline automation.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'devops_job');`,
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'ml_job', 'Data Scientist & ML Engineer', 'Must have experience with neural network architectures and PyTorch loops.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'ml_job');`,
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'nodejs_job', 'Full-Stack Node.js Developer', 'Must have experience with RESTful Express APIs and database transactions.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'nodejs_job');`,
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'security_job', 'Application Security Engineer', 'Must have experience with secure cryptographic password hashing algorithms.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'security_job');`,
		`INSERT INTO jobs (id, title, description, company_id) SELECT 'python_job', 'Python Backend Developer', 'Must have experience with FastAPI routing and async handler concurrency.', 'demo_company' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE id = 'python_job');`,
	}

	for _, q := range queries {
		if strings.HasPrefix(q, "CREATE TABLE") {
			if _, err := db.Exec(q); err != nil {
				return err
			}
		}
	}

	// Apply soft columns if migrations run on existing DB
	_, _ = db.Exec("ALTER TABLE candidates ADD COLUMN job_id TEXT DEFAULT 'default_job';")
	_, _ = db.Exec("ALTER TABLE candidates ADD COLUMN resume_s3_url TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE candidates ADD COLUMN recording_s3_url TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE candidates ADD COLUMN company_id TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE jobs ADD COLUMN company_id TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE sourcing_criteria ADD COLUMN company_id TEXT DEFAULT '';")
	_, _ = db.Exec("ALTER TABLE candidates ADD COLUMN interview_token TEXT DEFAULT '';")

	for _, q := range queries {
		if strings.HasPrefix(q, "INSERT INTO") {
			if _, err := db.Exec(q); err != nil {
				return err
			}
		}
	}



	// Seed demo company
	demoHash, _ := bcrypt.GenerateFromPassword([]byte("demo123"), bcrypt.DefaultCost)
	_, _ = db.Exec(`INSERT INTO companies (id, name, slug, email, password_hash, plan) SELECT 'demo_company', 'ZaraSourcing Demo', 'zarasourcing-demo', 'demo@zarasourcing.com', ?, 'enterprise' WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 'demo_company')`, string(demoHash))

	return nil
}

// Job opening queries
// Company queries
func (db *DB) CreateCompany(id, name, slug, email, password string) (*Company, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}
	now := time.Now()
	query := `INSERT INTO companies (id, name, slug, email, password_hash, plan, created_at) VALUES (?, ?, ?, ?, ?, 'free', ?)`
	_, err = db.Exec(query, id, name, slug, email, string(hash), now)
	if err != nil {
		return nil, err
	}
	// Auto-create sourcing criteria for this company
	_, _ = db.Exec(`INSERT INTO sourcing_criteria (weight_open_source, weight_code_quality, weight_experience, company_id) VALUES (33, 33, 34, ?)`, id)
	return &Company{ID: id, Name: name, Slug: slug, Email: email, Plan: "free", CreatedAt: now}, nil
}

func (db *DB) GetCompanyByEmail(email string) (*Company, error) {
	query := `SELECT id, name, slug, email, password_hash, logo_url, plan, created_at FROM companies WHERE email = ?`
	var c Company
	var createdAtStr string
	err := db.QueryRow(query, email).Scan(&c.ID, &c.Name, &c.Slug, &c.Email, &c.PasswordHash, &c.LogoURL, &c.Plan, &createdAtStr)
	if err != nil {
		return nil, err
	}
	c.CreatedAt = parseTimeStr(createdAtStr)
	return &c, nil
}

func (db *DB) GetCompanyByID(id string) (*Company, error) {
	query := `SELECT id, name, slug, email, password_hash, logo_url, plan, created_at FROM companies WHERE id = ?`
	var c Company
	var createdAtStr string
	err := db.QueryRow(query, id).Scan(&c.ID, &c.Name, &c.Slug, &c.Email, &c.PasswordHash, &c.LogoURL, &c.Plan, &createdAtStr)
	if err != nil {
		return nil, err
	}
	c.CreatedAt = parseTimeStr(createdAtStr)
	return &c, nil
}

func (db *DB) VerifyCompanyPassword(email, password string) (*Company, error) {
	c, err := db.GetCompanyByEmail(email)
	if err != nil {
		return nil, fmt.Errorf("company not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(c.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid password")
	}
	return c, nil
}

// Job opening queries
func (db *DB) CreateJob(id, title, description, companyID string) (*Job, error) {
	now := time.Now()
	query := `INSERT INTO jobs (id, title, description, company_id, created_at) VALUES (?, ?, ?, ?, ?)`
	_, err := db.Exec(query, id, title, description, companyID, now)
	if err != nil {
		return nil, err
	}
	return &Job{
		ID:          id,
		Title:       title,
		Description: description,
		CompanyID:   companyID,
		CreatedAt:   now,
	}, nil
}

func (db *DB) GetJobs() ([]Job, error) {
	query := `SELECT id, title, description, company_id, created_at FROM jobs ORDER BY created_at DESC`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Job
	for rows.Next() {
		var j Job
		var createdAtStr string
		if err := rows.Scan(&j.ID, &j.Title, &j.Description, &j.CompanyID, &createdAtStr); err != nil {
			return nil, err
		}
		j.CreatedAt = parseTimeStr(createdAtStr)
		list = append(list, j)
	}
	return list, nil
}

func (db *DB) GetJobsByCompany(companyID string) ([]Job, error) {
	query := `SELECT id, title, description, created_at, company_id FROM jobs WHERE company_id = ? ORDER BY created_at DESC`
	rows, err := db.Query(query, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []Job
	for rows.Next() {
		var j Job
		var tStr string
		if err := rows.Scan(&j.ID, &j.Title, &j.Description, &tStr, &j.CompanyID); err != nil {
			return nil, err
		}
		j.CreatedAt = parseTimeStr(tStr)
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (db *DB) GetJobByID(jobID string) (*Job, error) {
	query := `SELECT id, title, description, created_at, company_id FROM jobs WHERE id = ?`
	row := db.QueryRow(query, jobID)

	var j Job
	var tStr string
	if err := row.Scan(&j.ID, &j.Title, &j.Description, &tStr, &j.CompanyID); err != nil {
		return nil, err
	}
	j.CreatedAt = parseTimeStr(tStr)
	return &j, nil
}

// Candidate queries
func (db *DB) CreateCandidate(id, name, email, role, githubUsername, jobID, companyID, resumeS3URL string) (*Candidate, error) {
	now := time.Now()
	if jobID == "" {
		jobID = "default_job"
	}
	query := `INSERT INTO candidates (id, name, email, role, github_username, sourcing_score, status, job_id, company_id, resume_s3_url, recording_s3_url, created_at, updated_at) 
	          VALUES (?, ?, ?, ?, ?, 0, 'evaluating', ?, ?, ?, '', ?, ?)`
	_, err := db.Exec(query, id, name, email, role, githubUsername, jobID, companyID, resumeS3URL, now, now)
	if err != nil {
		return nil, err
	}
	return &Candidate{
		ID:             id,
		Name:           name,
		Email:          email,
		Role:           role,
		GithubUsername: githubUsername,
		SourcingScore:  0,
		Status:         "evaluating",
		JobID:          jobID,
		CompanyID:      companyID,
		ResumeS3URL:    resumeS3URL,
		RecordingS3URL: "",
		CreatedAt:      now,
		UpdatedAt:      now,
	}, nil
}

func (db *DB) GetCandidate(id string) (*Candidate, error) {
	query := `SELECT id, name, email, role, github_username, sourcing_score, status, job_id, company_id, resume_s3_url, recording_s3_url, created_at, updated_at FROM candidates WHERE id = ?`
	row := db.QueryRow(query, id)
	var c Candidate
	var createdAtStr, updatedAtStr string
	err := row.Scan(&c.ID, &c.Name, &c.Email, &c.Role, &c.GithubUsername, &c.SourcingScore, &c.Status, &c.JobID, &c.CompanyID, &c.ResumeS3URL, &c.RecordingS3URL, &createdAtStr, &updatedAtStr)
	if err != nil {
		return nil, err
	}
	c.CreatedAt = parseTimeStr(createdAtStr)
	c.UpdatedAt = parseTimeStr(updatedAtStr)
	return &c, nil
}

func (db *DB) UpdateCandidateScore(id string, score int, status string) error {
	query := `UPDATE candidates SET sourcing_score = ?, status = ?, updated_at = ? WHERE id = ?`
	_, err := db.Exec(query, score, status, time.Now(), id)
	return err
}

func (db *DB) ListCandidates() ([]Candidate, error) {
	query := `SELECT id, name, email, role, github_username, sourcing_score, status, job_id, company_id, resume_s3_url, recording_s3_url, created_at, updated_at FROM candidates ORDER BY sourcing_score DESC`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Candidate
	for rows.Next() {
		var c Candidate
		var createdAtStr, updatedAtStr string
		if err := rows.Scan(&c.ID, &c.Name, &c.Email, &c.Role, &c.GithubUsername, &c.SourcingScore, &c.Status, &c.JobID, &c.CompanyID, &c.ResumeS3URL, &c.RecordingS3URL, &createdAtStr, &updatedAtStr); err != nil {
			return nil, err
		}
		c.CreatedAt = parseTimeStr(createdAtStr)
		c.UpdatedAt = parseTimeStr(updatedAtStr)
		list = append(list, c)
	}
	return list, nil
}

func (db *DB) ListCandidatesByCompany(companyID, jobID string) ([]Candidate, error) {
	var query string
	var args []interface{}
	if jobID != "" {
		query = `SELECT id, name, email, role, github_username, sourcing_score, status, job_id, company_id, resume_s3_url, recording_s3_url, created_at, updated_at FROM candidates WHERE company_id = ? AND job_id = ? ORDER BY sourcing_score DESC`
		args = []interface{}{companyID, jobID}
	} else {
		query = `SELECT id, name, email, role, github_username, sourcing_score, status, job_id, company_id, resume_s3_url, recording_s3_url, created_at, updated_at FROM candidates WHERE company_id = ? ORDER BY sourcing_score DESC`
		args = []interface{}{companyID}
	}
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Candidate
	for rows.Next() {
		var c Candidate
		var createdAtStr, updatedAtStr string
		if err := rows.Scan(&c.ID, &c.Name, &c.Email, &c.Role, &c.GithubUsername, &c.SourcingScore, &c.Status, &c.JobID, &c.CompanyID, &c.ResumeS3URL, &c.RecordingS3URL, &createdAtStr, &updatedAtStr); err != nil {
			return nil, err
		}
		c.CreatedAt = parseTimeStr(createdAtStr)
		c.UpdatedAt = parseTimeStr(updatedAtStr)
		list = append(list, c)
	}
	return list, nil
}

func (db *DB) UpdateCandidateRecording(id string, recordingURL string) error {
	query := `UPDATE candidates SET recording_s3_url = ?, updated_at = ? WHERE id = ?`
	_, err := db.Exec(query, recordingURL, time.Now(), id)
	return err
}

// Claims Audit queries
func (db *DB) SaveClaimAudit(candidateID, claim, evidence, filepath, status, severity string) error {
	query := `INSERT INTO claims_audit (candidate_id, claim_text, evidence_text, file_path, status, severity) 
	          VALUES (?, ?, ?, ?, ?, ?)`
	_, err := db.Exec(query, candidateID, claim, evidence, filepath, status, severity)
	return err
}

func (db *DB) ClearClaimsAudit(candidateID string) error {
	query := `DELETE FROM claims_audit WHERE candidate_id = ?`
	_, err := db.Exec(query, candidateID)
	return err
}

func (db *DB) GetClaimsAudit(candidateID string) ([]ClaimAudit, error) {
	query := `SELECT id, candidate_id, claim_text, evidence_text, file_path, status, severity, created_at FROM claims_audit WHERE candidate_id = ?`
	rows, err := db.Query(query, candidateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ClaimAudit
	for rows.Next() {
		var ca ClaimAudit
		var createdAtStr string
		if err := rows.Scan(&ca.ID, &ca.CandidateID, &ca.ClaimText, &ca.EvidenceText, &ca.FilePath, &ca.Status, &ca.Severity, &createdAtStr); err != nil {
			return nil, err
		}
		ca.CreatedAt = parseTimeStr(createdAtStr)
		list = append(list, ca)
	}
	return list, nil
}

// Sourcing Criteria queries
func (db *DB) GetCriteria() (*SourcingCriteria, error) {
	query := `SELECT id, weight_open_source, weight_code_quality, weight_experience, llm_model, company_id, updated_at FROM sourcing_criteria WHERE id = 1`
	var sc SourcingCriteria
	var updatedAtStr string
	err := db.QueryRow(query).Scan(&sc.ID, &sc.WeightOpenSource, &sc.WeightCodeQuality, &sc.WeightExperience, &sc.LlmModel, &sc.CompanyID, &updatedAtStr)
	if err != nil {
		return nil, err
	}
	sc.UpdatedAt = parseTimeStr(updatedAtStr)
	return &sc, nil
}

func (db *DB) GetCriteriaByCompany(companyID string) (*SourcingCriteria, error) {
	query := `SELECT id, weight_open_source, weight_code_quality, weight_experience, llm_model, company_id, updated_at FROM sourcing_criteria WHERE company_id = ?`
	var sc SourcingCriteria
	var updatedAtStr string
	err := db.QueryRow(query, companyID).Scan(&sc.ID, &sc.WeightOpenSource, &sc.WeightCodeQuality, &sc.WeightExperience, &sc.LlmModel, &sc.CompanyID, &updatedAtStr)
	if err != nil {
		// If no criteria for this company, return defaults
		return &SourcingCriteria{WeightOpenSource: 33, WeightCodeQuality: 33, WeightExperience: 34, LlmModel: "gemini", CompanyID: companyID}, nil
	}
	sc.UpdatedAt = parseTimeStr(updatedAtStr)
	return &sc, nil
}

func (db *DB) UpdateCriteria(sc *SourcingCriteria) error {
	query := `UPDATE sourcing_criteria SET weight_open_source = ?, weight_code_quality = ?, weight_experience = ?, llm_model = ?, updated_at = ? WHERE id = 1`
	_, err := db.Exec(query, sc.WeightOpenSource, sc.WeightCodeQuality, sc.WeightExperience, sc.LlmModel, time.Now())
	return err
}

func (db *DB) UpdateCriteriaByCompany(sc *SourcingCriteria) error {
	// Try update first
	query := `UPDATE sourcing_criteria SET weight_open_source = ?, weight_code_quality = ?, weight_experience = ?, llm_model = ?, updated_at = ? WHERE company_id = ?`
	res, err := db.Exec(query, sc.WeightOpenSource, sc.WeightCodeQuality, sc.WeightExperience, sc.LlmModel, time.Now(), sc.CompanyID)
	if err != nil {
		return err
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		// Insert new row for this company
		_, err = db.Exec(`INSERT INTO sourcing_criteria (weight_open_source, weight_code_quality, weight_experience, llm_model, company_id) VALUES (?, ?, ?, ?, ?)`,
			sc.WeightOpenSource, sc.WeightCodeQuality, sc.WeightExperience, sc.LlmModel, sc.CompanyID)
	}
	return err
}

// Steps Session queries
func (db *DB) AddStep(sessionID, stepType, content, metadata string) (*Step, error) {
	now := time.Now()
	query := `INSERT INTO steps (session_id, type, content, metadata, created_at) VALUES (?, ?, ?, ?, ?)`
	res, err := db.Exec(query, sessionID, stepType, content, metadata, now)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &Step{
		ID:        id,
		SessionID: sessionID,
		Type:      stepType,
		Content:   content,
		Metadata:  metadata,
		CreatedAt: now,
	}, nil
}

func (db *DB) GetSessionSteps(sessionID string) ([]Step, error) {
	query := `SELECT id, session_id, type, content, metadata, created_at FROM steps WHERE session_id = ? ORDER BY id ASC`
	rows, err := db.Query(query, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Step
	for rows.Next() {
		var s Step
		var createdAtStr string
		if err := rows.Scan(&s.ID, &s.SessionID, &s.Type, &s.Content, &s.Metadata, &createdAtStr); err != nil {
			return nil, err
		}
		s.CreatedAt = parseTimeStr(createdAtStr)
		list = append(list, s)
	}
	return list, nil
}

// Proctoring Alerts
func (db *DB) SaveProctoringEvent(candidateID, timestamp, eventType string, duration int, details string) error {
	query := `INSERT INTO proctoring_events (candidate_id, timestamp, event_type, duration, details) VALUES (?, ?, ?, ?, ?)`
	_, err := db.Exec(query, candidateID, timestamp, eventType, duration, details)
	return err
}

func (db *DB) ClearProctoringEvents(candidateID string) error {
	query := `DELETE FROM proctoring_events WHERE candidate_id = ?`
	_, err := db.Exec(query, candidateID)
	return err
}

func (db *DB) GetProctoringEvents(candidateID string) ([]ProctoringEvent, error) {
	query := `SELECT id, candidate_id, timestamp, event_type, duration, details, created_at FROM proctoring_events WHERE candidate_id = ? ORDER BY id ASC`
	rows, err := db.Query(query, candidateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ProctoringEvent
	for rows.Next() {
		var pe ProctoringEvent
		var createdAtStr string
		if err := rows.Scan(&pe.ID, &pe.CandidateID, &pe.Timestamp, &pe.EventType, &pe.Duration, &pe.Details, &createdAtStr); err != nil {
			return nil, err
		}
		pe.CreatedAt = parseTimeStr(createdAtStr)
		list = append(list, pe)
	}
	return list, nil
}

// Helper: robust parsing of SQLite datetimes
func parseTimeStr(val string) time.Time {
	if t, err := time.Parse(time.RFC3339, val); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02 15:04:05.999999999-07:00", val); err == nil {
		return t
	}
	if t, err := time.Parse("2006-01-02 15:04:05", val); err == nil {
		return t
	}
	return time.Now()
}

// Interview Questions
func (db *DB) SetInterviewQuestions(jobID string, questions []string) error {
	_, _ = db.Exec(`DELETE FROM interview_questions WHERE job_id = ?`, jobID)
	for i, q := range questions {
		_, err := db.Exec(`INSERT INTO interview_questions (job_id, question, order_index) VALUES (?, ?, ?)`, jobID, q, i)
		if err != nil {
			return err
		}
	}
	return nil
}

func (db *DB) GetInterviewQuestions(jobID string) ([]InterviewQuestion, error) {
	rows, err := db.Query(`SELECT id, job_id, question, order_index, created_at FROM interview_questions WHERE job_id = ? ORDER BY order_index ASC`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []InterviewQuestion
	for rows.Next() {
		var q InterviewQuestion
		var tStr string
		if err := rows.Scan(&q.ID, &q.JobID, &q.Question, &q.OrderIndex, &tStr); err != nil {
			return nil, err
		}
		q.CreatedAt = parseTimeStr(tStr)
		list = append(list, q)
	}
	return list, nil
}

// Interview Sessions
func (db *DB) CreateInterviewSession(id, candidateID, jobID, token string) (*InterviewSession, error) {
	now := time.Now()
	_, err := db.Exec(`INSERT INTO interview_sessions (id, candidate_id, job_id, token, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
		id, candidateID, jobID, token, now, now)
	if err != nil {
		return nil, err
	}
	return &InterviewSession{ID: id, CandidateID: candidateID, JobID: jobID, Token: token, Status: "pending", CreatedAt: now, UpdatedAt: now}, nil
}

func (db *DB) GetInterviewSessionByToken(token string) (*InterviewSession, error) {
	var s InterviewSession
	var tCreate, tUpdate string
	err := db.QueryRow(`SELECT id, candidate_id, job_id, token, status, interview_score, fit_summary, answers, created_at, updated_at FROM interview_sessions WHERE token = ?`, token).
		Scan(&s.ID, &s.CandidateID, &s.JobID, &s.Token, &s.Status, &s.InterviewScore, &s.FitSummary, &s.Answers, &tCreate, &tUpdate)
	if err != nil {
		return nil, err
	}
	s.CreatedAt = parseTimeStr(tCreate)
	s.UpdatedAt = parseTimeStr(tUpdate)
	return &s, nil
}

func (db *DB) GetInterviewSessionsByJob(jobID string) ([]InterviewSession, error) {
	rows, err := db.Query(`SELECT id, candidate_id, job_id, token, status, interview_score, fit_summary, answers, created_at, updated_at FROM interview_sessions WHERE job_id = ? ORDER BY interview_score DESC`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []InterviewSession
	for rows.Next() {
		var s InterviewSession
		var tCreate, tUpdate string
		if err := rows.Scan(&s.ID, &s.CandidateID, &s.JobID, &s.Token, &s.Status, &s.InterviewScore, &s.FitSummary, &s.Answers, &tCreate, &tUpdate); err != nil {
			return nil, err
		}
		s.CreatedAt = parseTimeStr(tCreate)
		s.UpdatedAt = parseTimeStr(tUpdate)
		list = append(list, s)
	}
	return list, nil
}

func (db *DB) CompleteInterviewSession(id string, score int, fitSummary, answers string) error {
	_, err := db.Exec(`UPDATE interview_sessions SET status='completed', interview_score=?, fit_summary=?, answers=?, updated_at=? WHERE id=?`,
		score, fitSummary, answers, time.Now(), id)
	return err
}

func (db *DB) UpdateInterviewStatus(id, status string) error {
	_, err := db.Exec(`UPDATE interview_sessions SET status=?, updated_at=? WHERE id=?`, status, time.Now(), id)
	return err
}

// Admin stats
func (db *DB) GetAdminStats() (map[string]interface{}, error) {
	stats := map[string]interface{}{}
	var totalCompanies, totalJobs, totalCandidates, completedInterviews int
	_ = db.QueryRow(`SELECT COUNT(*) FROM companies`).Scan(&totalCompanies)
	_ = db.QueryRow(`SELECT COUNT(*) FROM jobs`).Scan(&totalJobs)
	_ = db.QueryRow(`SELECT COUNT(*) FROM candidates`).Scan(&totalCandidates)
	_ = db.QueryRow(`SELECT COUNT(*) FROM interview_sessions WHERE status='completed'`).Scan(&completedInterviews)
	stats["total_companies"] = totalCompanies
	stats["total_jobs"] = totalJobs
	stats["total_candidates"] = totalCandidates
	stats["completed_interviews"] = completedInterviews
	return stats, nil
}

func (db *DB) ListAllCompanies() ([]Company, error) {
	rows, err := db.Query(`SELECT id, name, slug, email, logo_url, plan, created_at FROM companies ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Company
	for rows.Next() {
		var c Company
		var tStr string
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug, &c.Email, &c.LogoURL, &c.Plan, &tStr); err != nil {
			return nil, err
		}
		c.CreatedAt = parseTimeStr(tStr)
		list = append(list, c)
	}
	return list, nil
}
