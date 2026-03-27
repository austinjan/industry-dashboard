.PHONY: dev db-up db-down migrate test fake-worker worker worker-config dashboard-cli

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
