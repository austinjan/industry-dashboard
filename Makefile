.PHONY: dev db-up db-down migrate test

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
	go run ./cmd/server

test:
	go test ./... -v

test-one:
	go test -v -run $(TEST) ./$(PKG)
