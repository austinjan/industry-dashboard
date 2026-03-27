# Stage 1: Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Go binaries
FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy frontend build output for embedding
COPY --from=frontend /app/frontend/dist cmd/server/frontend_dist
# Build server
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$(git describe --tags --always 2>/dev/null || echo docker)" -o /bin/dashboard-server ./cmd/server
# Build CLI
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$(git describe --tags --always 2>/dev/null || echo docker)" -o /bin/dashboard-cli ./cmd/dashboard-cli
# Build worker
RUN CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$(git describe --tags --always 2>/dev/null || echo docker)" -o /bin/dashboard-worker ./cmd/worker

# Stage 3: Runtime
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/dashboard-server /usr/local/bin/
COPY --from=builder /bin/dashboard-cli /usr/local/bin/
COPY --from=builder /bin/dashboard-worker /usr/local/bin/
COPY migrations /migrations
EXPOSE 8080
ENTRYPOINT ["dashboard-server"]
