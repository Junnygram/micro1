.PHONY: setup setup-backend setup-frontend build-backend run-backend run-frontend test-backend evaluate run clean fresh stop

# Path configuration
export PATH := $(PATH):/usr/local/go/bin:/usr/local/bin

setup: setup-backend setup-frontend
	@echo "Setup complete. Run: make run"

setup-backend:
	cd backend && go mod tidy

setup-frontend:
	cd frontend && npm install

build-backend:
	cd backend && go build -o backend_binary main.go

run-backend: build-backend
	cd backend && WORKSPACE_DIR=. ./backend_binary

run-frontend:
	cd frontend && npm run dev

test-backend:
	cd backend && go test -v ./pkg/...

evaluate:
	python3 evaluate.py

dev-backend:
	cd backend && WORKSPACE_DIR=. ./backend_binary

dev:
	@echo "Starting backend + frontend..."
	$(MAKE) stop
	cd backend && go build -o backend_binary main.go
	(cd backend && WORKSPACE_DIR=. ./backend_binary &) && cd frontend && npm run dev

stop:
	-lsof -t -i:8080 | xargs kill -9 2>/dev/null || true
	-lsof -t -i:3000 | xargs kill -9 2>/dev/null || true

run: stop build-backend
	@echo "Starting ZaraSourcing Backend and Frontend Dev Server..."
	@echo "Backend:  http://localhost:8080"
	@echo "Frontend: http://localhost:3000"
	@echo "Demo:     http://localhost:3000 → pick a candidate → Run GitHub Audit"
	(cd backend && WORKSPACE_DIR=. ./backend_binary &) && cd frontend && npm run dev

fresh: stop clean run

clean:
	rm -f backend/backend_binary
	rm -f backend/data/zarasourcing.db
	rm -f backend/data/zarasourcing.db-shm
	rm -f backend/data/zarasourcing.db-wal
