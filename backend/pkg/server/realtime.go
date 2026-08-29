package server

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/websocket"
)

func (s *Server) handleRealtimeSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/session/realtime/"), "/")
	if len(pathParts) == 0 || pathParts[0] == "" {
		http.Error(w, "Missing candidate ID", http.StatusBadRequest)
		return
	}
	candidateID := pathParts[0]

	sdpBytes, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read SDP", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	openAIKey := os.Getenv("OPENAI_API_KEY")
	if openAIKey == "" {
		http.Error(w, "OPENAI_API_KEY not configured", http.StatusInternalServerError)
		return
	}

	sessionConfig := map[string]interface{}{
		"type":  "realtime",
		"model": "gpt-4o-realtime-preview-2024-10-01",
		"audio": map[string]interface{}{
			"output": map[string]string{"voice": "alloy"},
		},
	}
	sessionConfigBytes, _ := json.Marshal(sessionConfig)

	var reqBody bytes.Buffer
	writer := multipart.NewWriter(&reqBody)

	_ = writer.WriteField("sdp", string(sdpBytes))
	_ = writer.WriteField("session", string(sessionConfigBytes))
	writer.Close()

	req, err := http.NewRequest("POST", "https://api.openai.com/v1/realtime/calls", &reqBody)
	if err != nil {
		http.Error(w, "Failed to create request", http.StatusInternalServerError)
		return
	}

	req.Header.Set("Authorization", "Bearer "+openAIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("OpenAI-Safety-Identifier", "hashed-user-id")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Failed to connect to OpenAI Realtime: %v", err)
		http.Error(w, "Failed to generate WebRTC token", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("OpenAI error: status %d body %s", resp.StatusCode, string(respBody))
		http.Error(w, "OpenAI API error", http.StatusInternalServerError)
		return
	}

	location := resp.Header.Get("Location")
	parts := strings.Split(location, "/")
	callId := parts[len(parts)-1]
	log.Printf("Obtained Call ID: %s", callId)

	answerSdp, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to read answer SDP", http.StatusInternalServerError)
		return
	}

	go s.initSideband(callId, candidateID)

	w.Header().Set("Content-Type", "application/sdp")
	w.WriteHeader(http.StatusOK)
	w.Write(answerSdp)
}

func (s *Server) initSideband(callId, candidateID string) {
	url := "wss://api.openai.com/v1/realtime?call_id=" + callId
	openAIKey := os.Getenv("OPENAI_API_KEY")

	dialer := websocket.DefaultDialer
	headers := http.Header{}
	headers.Add("Authorization", "Bearer "+openAIKey)

	ws, _, err := dialer.Dial(url, headers)
	if err != nil {
		log.Printf("WebSocket dial error for sideband: %v", err)
		return
	}
	defer ws.Close()

	log.Printf("Sideband WebSocket connected for call %s", callId)

	candidate, err := s.DB.GetCandidate(candidateID)
	if err != nil {
		log.Printf("Could not fetch candidate %s: %v", candidateID, err)
		return
	}

	job, err := s.DB.GetJobByID(candidate.JobID)
	var jobDesc string
	if err == nil {
		jobDesc = job.Description
	}

	instructions := fmt.Sprintf("You are an expert technical interviewer evaluating a candidate for the role of %s. \nJob Description: %s\n\nCandidate Name: %s\nCandidate GitHub: %s\n\nPlease ask 2-3 technical questions based on their profile to vet their claims.", candidate.Role, jobDesc, candidate.Name, candidate.GithubUsername)

	initMsg := map[string]interface{}{
		"type": "session.update",
		"session": map[string]interface{}{
			"type":         "realtime",
			"instructions": instructions,
		},
	}
	if err := ws.WriteJSON(initMsg); err != nil {
		log.Printf("Failed to write initial session.update: %v", err)
		return
	}

	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			break
		}

		var parsed map[string]interface{}
		if err := json.Unmarshal(message, &parsed); err != nil {
			continue
		}

		if parsed["type"] == "response.done" {
			// Extract transcript if possible
			log.Printf("Response done from AI for candidate %s", candidateID)
		}
	}
}
