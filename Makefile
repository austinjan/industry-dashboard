.PHONY: dev db-up db-down migrate test fake-worker worker worker-config dashboard-cli build build-frontend build-server build-cli build-worker release docker-build docker-run clean

db-up:
	docker compose up -d db

db-down:
	docker compose down

migrate:
	go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest \
		-path ./migrations -database "postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable" up

migrate-down:
	go run -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest \
		-path ./migrations -database "postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable" down 1

dev:
	DEV_MODE=1 go run ./cmd/server

test:
	go test ./... -v

test-one:
	go test -v -run $(TEST) ./$(PKG)

fake-worker:
	go run ./cmd/fake-worker

fake-worker-config:
	go run ./cmd/fake-worker -config $(CONFIG)

worker:
	go run -ldflags "-X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" ./cmd/worker

worker-config:
	go run -ldflags "-X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" ./cmd/worker -config $(CONFIG)

dashboard-cli:
	go build -ldflags "-X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" -o bin/dashboard-cli ./cmd/dashboard-cli

# Build all binaries
build: build-frontend build-server build-cli build-worker

build-frontend:
	cd frontend && npm ci && npm run build

build-server: build-frontend
	mkdir -p cmd/server/frontend_dist
	cp -r frontend/dist/* cmd/server/frontend_dist/
	CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" -o bin/dashboard-server ./cmd/server
	rm -rf cmd/server/frontend_dist

build-cli:
	CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" -o bin/dashboard-cli ./cmd/dashboard-cli

build-worker:
	CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" -o bin/dashboard-worker ./cmd/worker

# Cross-compilation for releases
release: build-frontend
	@echo "Building release binaries..."
	@mkdir -p dist cmd/server/frontend_dist
	cp -r frontend/dist/* cmd/server/frontend_dist/
	# Server
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always 2>/dev/null || echo dev)" -o dist/dashboard-server-linux-amd64 ./cmd/server
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always 2>/dev/null || echo dev)" -o dist/dashboard-server-linux-arm64 ./cmd/server
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always 2>/dev/null || echo dev)" -o dist/dashboard-server-darwin-amd64 ./cmd/server
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always 2>/dev/null || echo dev)" -o dist/dashboard-server-darwin-arm64 ./cmd/server
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w -X main.version=$$(git describe --tags --always 2>/dev/null || echo dev)" -o dist/dashboard-server-windows-amd64.exe ./cmd/server
	# CLI (cross-platform)
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-cli-linux-amd64 ./cmd/dashboard-cli
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-cli-linux-arm64 ./cmd/dashboard-cli
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-cli-darwin-amd64 ./cmd/dashboard-cli
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-cli-darwin-arm64 ./cmd/dashboard-cli
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-cli-windows-amd64.exe ./cmd/dashboard-cli
	# Worker
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-worker-linux-amd64 ./cmd/worker
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-worker-linux-arm64 ./cmd/worker
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-worker-darwin-amd64 ./cmd/worker
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-worker-darwin-arm64 ./cmd/worker
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-s -w" -o dist/dashboard-worker-windows-amd64.exe ./cmd/worker
	rm -rf cmd/server/frontend_dist
	@echo "Release binaries in dist/"

# Docker
docker-build:
	docker build -t industry-dashboard .

docker-run: docker-build
	docker compose up

clean:
	rm -rf bin/ dist/ cmd/server/frontend_dist
