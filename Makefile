.PHONY: setup-backend setup-frontend build-backend run-backend run-frontend test-backend test-project evaluate run clean

# Path configuration
export PATH := $(PATH):/usr/local/go/bin:/usr/local/bin

setup-backend:
	cd backend && go mod tidy

setup-frontend:
	cd frontend && npm install

build-backend:
	cd backend && go build -o backend_binary main.go

run-backend: build-backend
	cd backend && ./backend_binary

run-frontend:
	cd frontend && npm run dev

test-backend:
	cd backend && go test -v ./pkg/...

evaluate:
	python3 evaluate.py

run: build-backend
	@echo "Starting ZaraSourcing Backend and Frontend Dev Server..."
	@echo "Backend listening on http://localhost:8080"
	@echo "Frontend listening on http://localhost:3000"
	(make run-backend & make run-frontend)

clean:
	rm -f backend/backend_binary
	rm -f backend/data/zarasourcing.db
	rm -f backend/data/zarasourcing.db-shm
	rm -f backend/data/zarasourcing.db-wal
