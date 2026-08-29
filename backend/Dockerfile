FROM golang:alpine AS builder

# Install build dependencies for modernc.org/sqlite
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN go build -o server .

# Final stage
FROM alpine:latest

WORKDIR /app

# Copy binary, backup dataset, and data from builder
COPY --from=builder /app/server .
COPY --from=builder /app/data/candidates/dataset.json ./dataset.json
COPY --from=builder /app/data ./data

# Expose port
EXPOSE 8080

# Run the server
CMD ["./server"]
