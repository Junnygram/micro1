package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"backend/pkg/agent"
	"backend/pkg/db"
	"backend/pkg/server"

	"github.com/joho/godotenv"
)

func main() {
	// Try loading .env from current directory or workspace root
	workspaceDir := "/Users/junioroyewunmi/Desktop/micro1"
	
	// Load from workspace root
	envPath := filepath.Join(workspaceDir, ".env")
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("Warning: no .env file found at %s, relying on system env", envPath)
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Println("WARNING: GEMINI_API_KEY environment variable is not set. The agent calls will fail.")
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dbPath := filepath.Join(workspaceDir, "data", "zarasourcing.db")
	log.Printf("Initializing database at: %s", dbPath)
	database, err := db.InitDB(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Instantiate agents
	ag := agent.NewAgent(database, workspaceDir, apiKey)
	bl := agent.NewBaselineAgent(database, workspaceDir, apiKey)

	// Instantiate and launch server
	srv := server.NewServer(database, ag, bl, workspaceDir)
	addr := fmt.Sprintf("0.0.0.0:%s", port)
	log.Printf("ZaraSourcing server listening on http://%s", addr)
	
	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
