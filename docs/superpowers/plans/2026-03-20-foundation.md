# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the project with Go backend, React frontend, TimescaleDB schema, Microsoft Entra ID authentication, custom RBAC, and audit trail.

**Architecture:** Go monolith backend (chi router, pgx for Postgres) serving a REST API. React SPA frontend (Vite + TypeScript + shadcn/ui). TimescaleDB for relational + time-series storage. JWT-based sessions after Entra ID OIDC login. Middleware chain: auth → RBAC → audit.

**Tech Stack:** Go 1.22+, chi (router), pgx (Postgres driver), golang-jwt, React 18, TypeScript, Vite, shadcn/ui, Tailwind CSS, TanStack Query, TimescaleDB, golang-migrate, testify

---

## File Structure

```
industry-dashboard/
├── cmd/
│   └── server/
│       └── main.go                    # Entry point: config, DB, router, server start
├── internal/
│   ├── config/
│   │   └── config.go                  # Env-based configuration struct
│   ├── database/
│   │   └── database.go                # DB connection pool setup
│   ├── auth/
│   │   ├── handler.go                 # Login redirect, OIDC callback, refresh, me endpoints
│   │   ├── jwt.go                     # JWT creation, validation, claims
│   │   ├── oidc.go                    # Microsoft Entra ID OIDC client
│   │   └── middleware.go              # Auth middleware: extract + validate JWT from header
│   ├── rbac/
│   │   ├── handler.go                 # CRUD endpoints for roles, permissions, user-site-roles
│   │   ├── service.go                 # RBAC business logic, permission checking
│   │   ├── middleware.go              # RBAC middleware: check permission for route
│   │   └── store.go                   # RBAC database queries
│   ├── audit/
│   │   ├── handler.go                 # Audit log query endpoint
│   │   ├── middleware.go              # Audit middleware: log mutating requests
│   │   └── store.go                   # Audit log database queries
│   ├── site/
│   │   ├── handler.go                 # Site, production line, machine CRUD endpoints
│   │   └── store.go                   # Site/line/machine database queries
│   └── middleware/
│       └── cors.go                    # CORS middleware
├── migrations/
│   ├── 001_create_sites.up.sql
│   ├── 001_create_sites.down.sql
│   ├── 002_create_auth.up.sql
│   ├── 002_create_auth.down.sql
│   ├── 003_create_rbac.up.sql
│   ├── 003_create_rbac.down.sql
│   ├── 004_create_dashboards.up.sql
│   ├── 004_create_dashboards.down.sql
│   ├── 005_create_data_points.up.sql
│   ├── 005_create_data_points.down.sql
│   ├── 006_create_alerts.up.sql
│   ├── 006_create_alerts.down.sql
│   ├── 007_create_audit.up.sql
│   ├── 007_create_audit.down.sql
│   ├── 008_create_workers.up.sql
│   ├── 008_create_workers.down.sql
│   └── 009_seed_permissions.up.sql
│   └── 009_seed_permissions.down.sql
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx                   # App entry point
│       ├── App.tsx                    # Router + layout shell
│       ├── lib/
│       │   ├── api.ts                 # Fetch wrapper with JWT auth
│       │   └── auth.ts                # Auth context, token storage, login/logout
│       ├── components/
│       │   └── layout/
│       │       ├── AppShell.tsx        # Top nav + sidebar + content area
│       │       ├── Sidebar.tsx         # Left navigation
│       │       └── TopNav.tsx          # Site selector, user menu
│       └── pages/
│           ├── LoginPage.tsx           # Microsoft login redirect
│           ├── CallbackPage.tsx        # OIDC callback handler
│           ├── DashboardPage.tsx       # Placeholder landing page
│           ├── admin/
│           │   ├── UsersPage.tsx       # User management
│           │   ├── RolesPage.tsx       # Role management
│           │   └── AuditLogPage.tsx    # Audit log viewer
│           └── sites/
│               └── SitesPage.tsx       # Site list (placeholder)
├── docker-compose.yml                 # TimescaleDB + app for local dev
├── Makefile                           # Common commands
├── go.mod
└── go.sum
```

---

### Task 1: Project Scaffolding & Database Setup

**Files:**
- Create: `go.mod`, `cmd/server/main.go`, `internal/config/config.go`, `internal/database/database.go`
- Create: `docker-compose.yml`, `Makefile`
- Create: `migrations/001_create_sites.up.sql`, `migrations/001_create_sites.down.sql`

- [ ] **Step 1: Initialize Go module**

```bash
cd /Users/macmini-au/code/industry-dashboard
go mod init github.com/industry-dashboard/server
```

- [ ] **Step 2: Create docker-compose.yml for TimescaleDB**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_USER: dashboard
      POSTGRES_PASSWORD: dashboard
      POSTGRES_DB: industry_dashboard
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

- [ ] **Step 3: Create Makefile**

Create `Makefile`:

```makefile
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
```

- [ ] **Step 4: Create config package**

Create `internal/config/config.go`:

```go
package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string

	// Microsoft Entra ID
	AzureClientID     string
	AzureClientSecret string
	AzureTenantID     string
	AzureRedirectURL  string

	// JWT
	JWTSecret          string
	JWTAccessDuration  string // e.g., "15m"
	JWTRefreshDuration string // e.g., "168h"
}

func Load() *Config {
	return &Config{
		Port:               getEnv("PORT", "8080"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable"),
		AzureClientID:      getEnv("AZURE_CLIENT_ID", ""),
		AzureClientSecret:  getEnv("AZURE_CLIENT_SECRET", ""),
		AzureTenantID:      getEnv("AZURE_TENANT_ID", ""),
		AzureRedirectURL:   getEnv("AZURE_REDIRECT_URL", "http://localhost:8080/api/auth/callback"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTAccessDuration:  getEnv("JWT_ACCESS_DURATION", "15m"),
		JWTRefreshDuration: getEnv("JWT_REFRESH_DURATION", "168h"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 5: Create database package**

Create `internal/database/database.go`:

```go
package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}
	return pool, nil
}
```

- [ ] **Step 6: Create main.go with health check**

Create `cmd/server/main.go`:

```go
package main

import (
	"context"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	log.Printf("Server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
```

- [ ] **Step 7: Install Go dependencies**

```bash
cd /Users/macmini-au/code/industry-dashboard
go get github.com/go-chi/chi/v5
go get github.com/jackc/pgx/v5
go get github.com/golang-jwt/jwt/v5
go get github.com/stretchr/testify
go mod tidy
```

- [ ] **Step 8: Create first migration — sites, production_lines, machines**

Create `migrations/001_create_sites.up.sql`:

```sql
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE production_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    line_id UUID NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    model VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'offline',
    modbus_config JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_production_lines_site_id ON production_lines(site_id);
CREATE INDEX idx_machines_line_id ON machines(line_id);
```

Create `migrations/001_create_sites.down.sql`:

```sql
DROP TABLE IF EXISTS machines;
DROP TABLE IF EXISTS production_lines;
DROP TABLE IF EXISTS sites;
```

- [ ] **Step 9: Start DB and run migration**

```bash
make db-up
sleep 3
make migrate
```

Expected: migration applies successfully.

- [ ] **Step 10: Test server starts and connects to DB**

```bash
make dev &
sleep 2
curl http://localhost:8080/healthz
```

Expected: `ok`

- [ ] **Step 11: Commit**

```bash
git add go.mod go.sum cmd/ internal/config/ internal/database/ migrations/001_* docker-compose.yml Makefile
git commit -m "feat: project scaffolding with Go server, TimescaleDB, first migration"
```

---

### Task 2: Remaining Database Migrations

**Files:**
- Create: `migrations/002_create_auth.up.sql` through `migrations/009_seed_permissions.up.sql` (and corresponding `.down.sql`)

- [ ] **Step 1: Create auth migration**

Create `migrations/002_create_auth.up.sql`:

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    microsoft_id VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Create `migrations/002_create_auth.down.sql`:

```sql
DROP TABLE IF EXISTS users;
```

- [ ] **Step 2: Create RBAC migration**

Create `migrations/003_create_rbac.up.sql`:

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    group_name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_site_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, role_id, site_id)
);

CREATE INDEX idx_user_site_roles_user_id ON user_site_roles(user_id);
CREATE INDEX idx_user_site_roles_site_id ON user_site_roles(site_id);
```

Create `migrations/003_create_rbac.down.sql`:

```sql
DROP TABLE IF EXISTS user_site_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS permissions;
```

- [ ] **Step 3: Create dashboards migration**

Create `migrations/004_create_dashboards.up.sql`:

```sql
CREATE TABLE widget_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    default_config JSONB,
    schema JSONB
);

CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    layout_type VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (layout_type IN ('manual', 'ai_generated')),
    is_shared BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    widget_type VARCHAR(100) NOT NULL,
    position_x INT NOT NULL DEFAULT 0,
    position_y INT NOT NULL DEFAULT 0,
    width INT NOT NULL DEFAULT 4,
    height INT NOT NULL DEFAULT 4,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboards_owner_id ON dashboards(owner_id);
CREATE INDEX idx_dashboards_site_id ON dashboards(site_id);
CREATE INDEX idx_dashboard_widgets_dashboard_id ON dashboard_widgets(dashboard_id);
```

Create `migrations/004_create_dashboards.down.sql`:

```sql
DROP TABLE IF EXISTS dashboard_widgets;
DROP TABLE IF EXISTS dashboards;
DROP TABLE IF EXISTS widget_types;
```

- [ ] **Step 4: Create data_points hypertable migration**

Create `migrations/005_create_data_points.up.sql`:

```sql
CREATE TABLE data_points (
    time TIMESTAMPTZ NOT NULL,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION NOT NULL
);

SELECT create_hypertable('data_points', 'time');

CREATE INDEX idx_data_points_machine_metric ON data_points (machine_id, metric_name, time DESC);
```

Create `migrations/005_create_data_points.down.sql`:

```sql
DROP TABLE IF EXISTS data_points;
```

- [ ] **Step 5: Create alerts migration**

Create `migrations/006_create_alerts.up.sql`:

```sql
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    condition VARCHAR(20) NOT NULL CHECK (condition IN ('>', '<', '>=', '<=', '==')),
    threshold DOUBLE PRECISION NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES users(id)
);

CREATE INDEX idx_alerts_machine_id ON alerts(machine_id);
CREATE INDEX idx_alert_events_alert_id ON alert_events(alert_id);
CREATE INDEX idx_alert_events_triggered_at ON alert_events(triggered_at DESC);
```

Create `migrations/006_create_alerts.down.sql`:

```sql
DROP TABLE IF EXISTS alert_events;
DROP TABLE IF EXISTS alerts;
```

- [ ] **Step 6: Create audit migration**

Create `migrations/007_create_audit.up.sql`:

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
```

Create `migrations/007_create_audit.down.sql`:

```sql
DROP TABLE IF EXISTS audit_logs;
```

- [ ] **Step 7: Create workers migration**

Create `migrations/008_create_workers.up.sql`:

```sql
CREATE TABLE machine_workers (
    machine_id UUID PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
    worker_id VARCHAR(255) NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machine_workers_heartbeat ON machine_workers(heartbeat_at);
```

Create `migrations/008_create_workers.down.sql`:

```sql
DROP TABLE IF EXISTS machine_workers;
```

- [ ] **Step 8: Create seed permissions migration**

Create `migrations/009_seed_permissions.up.sql`:

```sql
-- Seed system permissions
INSERT INTO permissions (code, group_name, description) VALUES
    ('dashboard:view', 'Dashboard', 'View dashboards'),
    ('dashboard:create', 'Dashboard', 'Create dashboards'),
    ('dashboard:edit', 'Dashboard', 'Edit dashboards'),
    ('dashboard:delete', 'Dashboard', 'Delete dashboards'),
    ('dashboard:share', 'Dashboard', 'Share dashboards with others'),
    ('machine:view', 'Machine & Data', 'View machines and production lines'),
    ('machine:edit', 'Machine & Data', 'Edit machine configuration'),
    ('datapoint:view', 'Machine & Data', 'View sensor data'),
    ('datapoint:export', 'Machine & Data', 'Export sensor data'),
    ('alert:view', 'Alerts', 'View alerts'),
    ('alert:create', 'Alerts', 'Create alert rules'),
    ('alert:manage', 'Alerts', 'Manage alert rules'),
    ('alert:acknowledge', 'Alerts', 'Acknowledge triggered alerts'),
    ('user:manage', 'Admin', 'Manage users'),
    ('role:manage', 'Admin', 'Manage roles and permissions'),
    ('site:manage', 'Admin', 'Manage sites'),
    ('audit:view', 'Admin', 'View audit logs');

-- Seed default role templates
INSERT INTO roles (name, description, is_system) VALUES
    ('Admin', 'Full access to all features and all sites', true),
    ('Manager', 'Manage dashboards, alerts, and view data for assigned sites', true),
    ('Operator', 'View data, create personal dashboards, acknowledge alerts', true),
    ('Viewer', 'Read-only access to assigned sites', true);

-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Admin';

-- Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager' AND p.code IN (
    'dashboard:view', 'dashboard:create', 'dashboard:edit', 'dashboard:delete', 'dashboard:share',
    'machine:view', 'datapoint:view', 'datapoint:export',
    'alert:view', 'alert:create', 'alert:manage', 'alert:acknowledge',
    'audit:view'
);

-- Operator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Operator' AND p.code IN (
    'dashboard:view', 'dashboard:create',
    'machine:view', 'datapoint:view',
    'alert:view', 'alert:acknowledge'
);

-- Viewer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Viewer' AND p.code IN (
    'dashboard:view',
    'machine:view', 'datapoint:view',
    'alert:view'
);
```

Create `migrations/009_seed_permissions.down.sql`:

```sql
DELETE FROM role_permissions;
DELETE FROM roles WHERE is_system = true;
DELETE FROM permissions;
```

- [ ] **Step 9: Run all migrations**

```bash
make migrate
```

Expected: all 9 migrations apply successfully.

- [ ] **Step 10: Commit**

```bash
git add migrations/
git commit -m "feat: add all database migrations — auth, RBAC, dashboards, data_points, alerts, audit, workers, seed permissions"
```

---

### Task 3: JWT Authentication

**Files:**
- Create: `internal/auth/jwt.go`, `internal/auth/jwt_test.go`

- [ ] **Step 1: Write failing tests for JWT creation and validation**

Create `internal/auth/jwt_test.go`:

```go
package auth_test

import (
	"testing"
	"time"

	"github.com/industry-dashboard/server/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateAccessToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)

	token, err := j.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)
	assert.NotEmpty(t, token)
}

func TestValidateAccessToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)

	token, err := j.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)

	claims, err := j.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", claims.UserID)
	assert.Equal(t, "user@example.com", claims.Email)
	assert.Equal(t, "access", claims.TokenType)
}

func TestCreateRefreshToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)

	token, err := j.CreateRefreshToken("user-123", "user@example.com")
	require.NoError(t, err)

	claims, err := j.ValidateToken(token)
	require.NoError(t, err)
	assert.Equal(t, "refresh", claims.TokenType)
}

func TestValidateExpiredToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", -1*time.Second, 168*time.Hour)

	token, err := j.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)

	_, err = j.ValidateToken(token)
	assert.Error(t, err)
}

func TestValidateWrongSecret(t *testing.T) {
	j1 := auth.NewJWTService("secret-1", 15*time.Minute, 168*time.Hour)
	j2 := auth.NewJWTService("secret-2", 15*time.Minute, 168*time.Hour)

	token, err := j1.CreateAccessToken("user-123", "user@example.com")
	require.NoError(t, err)

	_, err = j2.ValidateToken(token)
	assert.Error(t, err)
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/auth/ -v
```

Expected: FAIL — `auth` package doesn't exist yet.

- [ ] **Step 3: Implement JWT service**

Create `internal/auth/jwt.go`:

```go
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID    string `json:"user_id"`
	Email     string `json:"email"`
	TokenType string `json:"token_type"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secret          []byte
	accessDuration  time.Duration
	refreshDuration time.Duration
}

func NewJWTService(secret string, accessDuration, refreshDuration time.Duration) *JWTService {
	return &JWTService{
		secret:          []byte(secret),
		accessDuration:  accessDuration,
		refreshDuration: refreshDuration,
	}
}

func (s *JWTService) CreateAccessToken(userID, email string) (string, error) {
	return s.createToken(userID, email, "access", s.accessDuration)
}

func (s *JWTService) CreateRefreshToken(userID, email string) (string, error) {
	return s.createToken(userID, email, "refresh", s.refreshDuration)
}

func (s *JWTService) createToken(userID, email, tokenType string, duration time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Email:     email,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(duration)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

func (s *JWTService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/auth/ -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/auth/jwt.go internal/auth/jwt_test.go
git commit -m "feat: add JWT service with access/refresh token creation and validation"
```

---

### Task 4: Auth Middleware

**Files:**
- Create: `internal/auth/middleware.go`, `internal/auth/middleware_test.go`

- [ ] **Step 1: Write failing tests for auth middleware**

Create `internal/auth/middleware_test.go`:

```go
package auth_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/industry-dashboard/server/internal/auth"
	"github.com/stretchr/testify/assert"
)

func TestAuthMiddleware_NoToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	mw := auth.NewMiddleware(j)

	handler := mw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuthMiddleware_ValidToken(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	mw := auth.NewMiddleware(j)

	token, _ := j.CreateAccessToken("user-123", "user@example.com")

	handler := mw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := auth.GetClaims(r.Context())
		assert.Equal(t, "user-123", claims.UserID)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAuthMiddleware_RefreshTokenRejected(t *testing.T) {
	j := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	mw := auth.NewMiddleware(j)

	token, _ := j.CreateRefreshToken("user-123", "user@example.com")

	handler := mw.Authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/auth/ -v -run TestAuthMiddleware
```

Expected: FAIL.

- [ ] **Step 3: Implement auth middleware**

Create `internal/auth/middleware.go`:

```go
package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const claimsKey contextKey = "claims"

type Middleware struct {
	jwt *JWTService
}

func NewMiddleware(jwt *JWTService) *Middleware {
	return &Middleware{jwt: jwt}
}

func (m *Middleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		tokenString := strings.TrimPrefix(header, "Bearer ")

		claims, err := m.jwt.ValidateToken(tokenString)
		if err != nil || claims.TokenType != "access" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetClaims(ctx context.Context) *Claims {
	claims, _ := ctx.Value(claimsKey).(*Claims)
	return claims
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
go test ./internal/auth/ -v
```

Expected: all 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/auth/middleware.go internal/auth/middleware_test.go
git commit -m "feat: add auth middleware — extracts and validates JWT from Authorization header"
```

---

### Task 5: Microsoft Entra ID OIDC Client

**Files:**
- Create: `internal/auth/oidc.go`, `internal/auth/handler.go`

- [ ] **Step 1: Implement OIDC client**

Create `internal/auth/oidc.go`:

```go
package auth

import (
	"context"
	"fmt"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type OIDCClient struct {
	provider     *oidc.Provider
	oauth2Config oauth2.Config
	verifier     *oidc.IDTokenVerifier
}

type OIDCUser struct {
	MicrosoftID string
	Email       string
	Name        string
}

func NewOIDCClient(ctx context.Context, tenantID, clientID, clientSecret, redirectURL string) (*OIDCClient, error) {
	issuerURL := fmt.Sprintf("https://login.microsoftonline.com/%s/v2.0", tenantID)
	provider, err := oidc.NewProvider(ctx, issuerURL)
	if err != nil {
		return nil, fmt.Errorf("failed to create OIDC provider: %w", err)
	}

	oauth2Config := oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "profile", "email"},
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: clientID})

	return &OIDCClient{
		provider:     provider,
		oauth2Config: oauth2Config,
		verifier:     verifier,
	}, nil
}

func (c *OIDCClient) AuthURL(state string) string {
	return c.oauth2Config.AuthCodeURL(state)
}

func (c *OIDCClient) Exchange(ctx context.Context, code string) (*OIDCUser, error) {
	token, err := c.oauth2Config.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("failed to exchange code: %w", err)
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("no id_token in response")
	}

	idToken, err := c.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify id_token: %w", err)
	}

	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, fmt.Errorf("failed to parse claims: %w", err)
	}

	return &OIDCUser{
		MicrosoftID: claims.Sub,
		Email:       claims.Email,
		Name:        claims.Name,
	}, nil
}
```

- [ ] **Step 2: Implement auth handler**

Create `internal/auth/handler.go`:

```go
package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	oidc *OIDCClient
	jwt  *JWTService
	db   *pgxpool.Pool
}

func NewHandler(oidc *OIDCClient, jwt *JWTService, db *pgxpool.Pool) *Handler {
	return &Handler{oidc: oidc, jwt: jwt, db: db}
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	state := generateState()
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, h.oidc.AuthURL(state), http.StatusTemporaryRedirect)
}

func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("oauth_state")
	if err != nil || cookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}

	oidcUser, err := h.oidc.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "authentication failed", http.StatusUnauthorized)
		return
	}

	// JIT provisioning: upsert user
	user, err := h.upsertUser(r.Context(), oidcUser)
	if err != nil {
		http.Error(w, "failed to provision user", http.StatusInternalServerError)
		return
	}

	accessToken, err := h.jwt.CreateAccessToken(user.ID, user.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}

	refreshToken, err := h.jwt.CreateRefreshToken(user.ID, user.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}

	// Redirect to frontend with tokens
	http.Redirect(w, r, "/?access_token="+accessToken+"&refresh_token="+refreshToken, http.StatusTemporaryRedirect)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	claims, err := h.jwt.ValidateToken(body.RefreshToken)
	if err != nil || claims.TokenType != "refresh" {
		http.Error(w, "invalid refresh token", http.StatusUnauthorized)
		return
	}

	accessToken, err := h.jwt.CreateAccessToken(claims.UserID, claims.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}

	refreshToken, err := h.jwt.CreateRefreshToken(claims.UserID, claims.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r.Context())
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var user struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	err := h.db.QueryRow(r.Context(),
		"SELECT id, email, name FROM users WHERE id = $1", claims.UserID,
	).Scan(&user.ID, &user.Email, &user.Name)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

type dbUser struct {
	ID    string
	Email string
}

func (h *Handler) upsertUser(ctx context.Context, oidcUser *OIDCUser) (*dbUser, error) {
	var user dbUser
	err := h.db.QueryRow(ctx,
		`INSERT INTO users (email, name, microsoft_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (microsoft_id) DO UPDATE SET
		   email = EXCLUDED.email,
		   name = EXCLUDED.name,
		   updated_at = NOW()
		 RETURNING id, email`,
		oidcUser.Email, oidcUser.Name, oidcUser.MicrosoftID,
	).Scan(&user.ID, &user.Email)
	return &user, err
}

func generateState() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
```

- [ ] **Step 3: Install OIDC dependencies**

```bash
go get github.com/coreos/go-oidc/v3/oidc
go get golang.org/x/oauth2
go mod tidy
```

- [ ] **Step 4: Verify compilation**

```bash
go build ./...
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add internal/auth/oidc.go internal/auth/handler.go go.mod go.sum
git commit -m "feat: add Microsoft Entra ID OIDC client and auth handler with JIT user provisioning"
```

---

### Task 6: RBAC Service & Store

**Files:**
- Create: `internal/rbac/store.go`, `internal/rbac/service.go`, `internal/rbac/service_test.go`

- [ ] **Step 1: Implement RBAC store**

Create `internal/rbac/store.go`:

```go
package rbac

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type Role struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsSystem    bool   `json:"is_system"`
}

type Permission struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	GroupName   string `json:"group_name"`
	Description string `json:"description"`
}

type UserSiteRole struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	RoleID string `json:"role_id"`
	SiteID string `json:"site_id"`
}

func (s *Store) GetUserPermissionsForSite(ctx context.Context, userID, siteID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT p.code
		 FROM user_site_roles usr
		 JOIN role_permissions rp ON rp.role_id = usr.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 WHERE usr.user_id = $1 AND (usr.site_id = $2 OR usr.site_id IS NULL)`,
		userID, siteID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		perms = append(perms, code)
	}
	return perms, nil
}

func (s *Store) IsGlobalAdmin(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM user_site_roles usr
			JOIN roles r ON r.id = usr.role_id
			WHERE usr.user_id = $1 AND r.name = 'Admin' AND usr.site_id IS NULL
		)`, userID,
	).Scan(&exists)
	return exists, err
}

func (s *Store) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name, description, is_system FROM roles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.IsSystem); err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	return roles, nil
}

func (s *Store) ListPermissions(ctx context.Context) ([]Permission, error) {
	rows, err := s.db.Query(ctx, `SELECT id, code, group_name, description FROM permissions ORDER BY group_name, code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.ID, &p.Code, &p.GroupName, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func (s *Store) CreateRole(ctx context.Context, name, description string, permissionIDs []string) (*Role, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var role Role
	err = tx.QueryRow(ctx,
		`INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system`,
		name, description,
	).Scan(&role.ID, &role.Name, &role.Description, &role.IsSystem)
	if err != nil {
		return nil, err
	}

	for _, pid := range permissionIDs {
		_, err = tx.Exec(ctx,
			`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
			role.ID, pid,
		)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &role, nil
}

func (s *Store) AssignUserSiteRole(ctx context.Context, userID, roleID, siteID string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO user_site_roles (user_id, role_id, site_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, role_id, site_id) DO NOTHING`,
		userID, roleID, siteID,
	)
	return err
}

func (s *Store) RemoveUserSiteRole(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM user_site_roles WHERE id = $1`, id)
	return err
}

func (s *Store) GetRolePermissions(ctx context.Context, roleID string) ([]Permission, error) {
	rows, err := s.db.Query(ctx,
		`SELECT p.id, p.code, p.group_name, p.description
		 FROM permissions p
		 JOIN role_permissions rp ON rp.permission_id = p.id
		 WHERE rp.role_id = $1
		 ORDER BY p.group_name, p.code`,
		roleID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.ID, &p.Code, &p.GroupName, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}
```

- [ ] **Step 2: Implement RBAC service**

Create `internal/rbac/service.go`:

```go
package rbac

import "context"

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

func (s *Service) HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error) {
	isAdmin, err := s.store.IsGlobalAdmin(ctx, userID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}

	perms, err := s.store.GetUserPermissionsForSite(ctx, userID, siteID)
	if err != nil {
		return false, err
	}

	for _, p := range perms {
		if p == permission {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) GetUserSitePermissions(ctx context.Context, userID, siteID string) ([]string, error) {
	isAdmin, err := s.store.IsGlobalAdmin(ctx, userID)
	if err != nil {
		return nil, err
	}
	if isAdmin {
		perms, err := s.store.ListPermissions(ctx)
		if err != nil {
			return nil, err
		}
		codes := make([]string, len(perms))
		for i, p := range perms {
			codes[i] = p.Code
		}
		return codes, nil
	}
	return s.store.GetUserPermissionsForSite(ctx, userID, siteID)
}
```

- [ ] **Step 3: Verify compilation**

```bash
go build ./...
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add internal/rbac/store.go internal/rbac/service.go
git commit -m "feat: add RBAC store and service — permission checking, role CRUD, user-site-role assignments"
```

---

### Task 7: RBAC Middleware

**Files:**
- Create: `internal/rbac/middleware.go`, `internal/rbac/middleware_test.go`

- [ ] **Step 1: Write failing tests for RBAC middleware**

Create `internal/rbac/middleware_test.go`:

```go
package rbac_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/rbac"
	"github.com/stretchr/testify/assert"
)

type mockPermissionChecker struct {
	result bool
	err    error
}

func (m *mockPermissionChecker) HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error) {
	return m.result, m.err
}

func TestRBACMiddleware_Allowed(t *testing.T) {
	mw := rbac.NewMiddleware(&mockPermissionChecker{result: true})

	handler := mw.Require("dashboard:view", rbac.SiteFromQuery)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest("GET", "/?site_id=site-1", nil)
	claims := &auth.Claims{UserID: "user-1", Email: "user@test.com", TokenType: "access"}
	ctx := auth.SetClaims(req.Context(), claims)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestRBACMiddleware_Denied(t *testing.T) {
	mw := rbac.NewMiddleware(&mockPermissionChecker{result: false})

	handler := mw.Require("user:manage", rbac.SiteFromQuery)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest("GET", "/?site_id=site-1", nil)
	claims := &auth.Claims{UserID: "user-1", Email: "user@test.com", TokenType: "access"}
	ctx := auth.SetClaims(req.Context(), claims)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestRBACMiddleware_NoClaims(t *testing.T) {
	mw := rbac.NewMiddleware(&mockPermissionChecker{result: true})

	handler := mw.Require("dashboard:view", rbac.SiteFromQuery)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)

	req := httptest.NewRequest("GET", "/?site_id=site-1", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/rbac/ -v
```

Expected: FAIL.

- [ ] **Step 3: Add SetClaims helper to auth package**

Update `internal/auth/middleware.go` — add this function:

```go
func SetClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}
```

- [ ] **Step 4: Implement RBAC middleware**

Create `internal/rbac/middleware.go`:

```go
package rbac

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/auth"
)

type PermissionChecker interface {
	HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error)
}

type SiteExtractor func(r *http.Request) string

func SiteFromQuery(r *http.Request) string {
	return r.URL.Query().Get("site_id")
}

func SiteFromURLParam(r *http.Request) string {
	return chi.URLParam(r, "siteID")
}

type RBACMiddleware struct {
	checker PermissionChecker
}

func NewMiddleware(checker PermissionChecker) *RBACMiddleware {
	return &RBACMiddleware{checker: checker}
}

func (m *RBACMiddleware) Require(permission string, extractSite SiteExtractor) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := auth.GetClaims(r.Context())
			if claims == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}

			siteID := extractSite(r)

			allowed, err := m.checker.HasPermission(r.Context(), claims.UserID, siteID, permission)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
go test ./internal/rbac/ -v
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add internal/rbac/middleware.go internal/rbac/middleware_test.go internal/auth/middleware.go
git commit -m "feat: add RBAC middleware — permission-based route protection with site scoping"
```

---

### Task 8: RBAC Handler (API Endpoints)

**Files:**
- Create: `internal/rbac/handler.go`

- [ ] **Step 1: Implement RBAC handler**

Create `internal/rbac/handler.go`:

```go
package rbac

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListRoles(w http.ResponseWriter, r *http.Request) {
	roles, err := h.store.ListRoles(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(roles)
}

func (h *Handler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	perms, err := h.store.ListPermissions(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(perms)
}

func (h *Handler) GetRolePermissions(w http.ResponseWriter, r *http.Request) {
	roleID := chi.URLParam(r, "roleID")
	perms, err := h.store.GetRolePermissions(r.Context(), roleID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(perms)
}

func (h *Handler) CreateRole(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name          string   `json:"name"`
		Description   string   `json:"description"`
		PermissionIDs []string `json:"permission_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	role, err := h.store.CreateRole(r.Context(), body.Name, body.Description, body.PermissionIDs)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(role)
}

func (h *Handler) AssignUserSiteRole(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID string `json:"user_id"`
		RoleID string `json:"role_id"`
		SiteID string `json:"site_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.UserID == "" || body.RoleID == "" {
		http.Error(w, "user_id and role_id are required", http.StatusBadRequest)
		return
	}

	if err := h.store.AssignUserSiteRole(r.Context(), body.UserID, body.RoleID, body.SiteID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveUserSiteRole(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.RemoveUserSiteRole(r.Context(), id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 2: Verify compilation**

```bash
go build ./...
```

Expected: compiles without errors.

- [ ] **Step 3: Commit**

```bash
git add internal/rbac/handler.go
git commit -m "feat: add RBAC handler — role CRUD, permission listing, user-site-role assignment endpoints"
```

---

### Task 9: Audit Trail Middleware & Store

**Files:**
- Create: `internal/audit/store.go`, `internal/audit/middleware.go`, `internal/audit/handler.go`, `internal/audit/middleware_test.go`

- [ ] **Step 1: Write failing test for audit middleware**

Create `internal/audit/middleware_test.go`:

```go
package audit_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/industry-dashboard/server/internal/audit"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/stretchr/testify/assert"
)

type mockAuditStore struct {
	mu      sync.Mutex
	entries []audit.Entry
}

func (m *mockAuditStore) Log(ctx context.Context, entry audit.Entry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = append(m.entries, entry)
	return nil
}

func TestAuditMiddleware_LogsMutatingRequests(t *testing.T) {
	store := &mockAuditStore{}
	mw := audit.NewMiddleware(store)

	handler := mw.Log("role", "create")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))

	req := httptest.NewRequest("POST", "/api/roles", nil)
	claims := &auth.Claims{UserID: "user-1", Email: "user@test.com", TokenType: "access"}
	ctx := auth.SetClaims(req.Context(), claims)
	req = req.WithContext(ctx)

	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Len(t, store.entries, 1)
	assert.Equal(t, "user-1", store.entries[0].UserID)
	assert.Equal(t, "role", store.entries[0].ResourceType)
	assert.Equal(t, "create", store.entries[0].Action)
}

func TestAuditMiddleware_SkipsUnauthenticated(t *testing.T) {
	store := &mockAuditStore{}
	mw := audit.NewMiddleware(store)

	handler := mw.Log("role", "create")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))

	req := httptest.NewRequest("POST", "/api/roles", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Len(t, store.entries, 0)
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
go test ./internal/audit/ -v
```

Expected: FAIL.

- [ ] **Step 3: Implement audit store**

Create `internal/audit/store.go`:

```go
package audit

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Entry struct {
	UserID       string
	Action       string
	ResourceType string
	ResourceID   string
	Details      map[string]interface{}
	IPAddress    string
	Timestamp    time.Time
}

type Logger interface {
	Log(ctx context.Context, entry Entry) error
}

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) Log(ctx context.Context, entry Entry) error {
	details, _ := json.Marshal(entry.Details)
	_, err := s.db.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, timestamp)
		 VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
		entry.UserID, entry.Action, entry.ResourceType, entry.ResourceID, details, entry.IPAddress, entry.Timestamp,
	)
	return err
}

type AuditLog struct {
	ID           string                 `json:"id"`
	UserID       string                 `json:"user_id"`
	Action       string                 `json:"action"`
	ResourceType string                 `json:"resource_type"`
	ResourceID   string                 `json:"resource_id"`
	Details      map[string]interface{} `json:"details"`
	IPAddress    string                 `json:"ip_address"`
	Timestamp    time.Time              `json:"timestamp"`
}

type ListParams struct {
	SiteID       string
	UserID       string
	Action       string
	ResourceType string
	Limit        int
	Offset       int
}

func (s *Store) List(ctx context.Context, params ListParams) ([]AuditLog, error) {
	if params.Limit == 0 {
		params.Limit = 50
	}

	query := `SELECT id, user_id, action, resource_type, resource_id, details, ip_address, timestamp
		FROM audit_logs WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if params.UserID != "" {
		query += ` AND user_id = $` + itoa(argIdx)
		args = append(args, params.UserID)
		argIdx++
	}
	if params.Action != "" {
		query += ` AND action = $` + itoa(argIdx)
		args = append(args, params.Action)
		argIdx++
	}
	if params.ResourceType != "" {
		query += ` AND resource_type = $` + itoa(argIdx)
		args = append(args, params.ResourceType)
		argIdx++
	}

	query += ` ORDER BY timestamp DESC LIMIT $` + itoa(argIdx) + ` OFFSET $` + itoa(argIdx+1)
	args = append(args, params.Limit, params.Offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var logs []AuditLog
	for rows.Next() {
		var l AuditLog
		var details []byte
		var ipAddr *string
		if err := rows.Scan(&l.ID, &l.UserID, &l.Action, &l.ResourceType, &l.ResourceID, &details, &ipAddr, &l.Timestamp); err != nil {
			return nil, err
		}
		if details != nil {
			json.Unmarshal(details, &l.Details)
		}
		if ipAddr != nil {
			l.IPAddress = *ipAddr
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func itoa(i int) string {
	return strconv.Itoa(i)
}
```

- [ ] **Step 4: Implement audit middleware**

Create `internal/audit/middleware.go`:

```go
package audit

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/industry-dashboard/server/internal/auth"
)

type Middleware struct {
	logger Logger
}

func NewMiddleware(logger Logger) *Middleware {
	return &Middleware{logger: logger}
}

func (m *Middleware) Log(resourceType, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)

			claims := auth.GetClaims(r.Context())
			if claims == nil {
				return
			}

			go m.logger.Log(context.Background(), Entry{
				UserID:       claims.UserID,
				Action:       action,
				ResourceType: resourceType,
				IPAddress:    extractIP(r),
				Timestamp:    time.Now(),
			})
		})
	}
}

func extractIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.Split(forwarded, ",")[0]
	}
	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		ip = ip[:idx]
	}
	return ip
}
```

- [ ] **Step 5: Implement audit handler**

Create `internal/audit/handler.go`:

```go
package audit

import (
	"encoding/json"
	"net/http"
	"strconv"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	params := ListParams{
		UserID:       r.URL.Query().Get("user_id"),
		Action:       r.URL.Query().Get("action"),
		ResourceType: r.URL.Query().Get("resource_type"),
		Limit:        limit,
		Offset:       offset,
	}

	logs, err := h.store.List(r.Context(), params)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(logs)
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
go test ./internal/audit/ -v
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add internal/audit/
git commit -m "feat: add audit trail — middleware logs mutating requests, store persists to DB, handler queries logs"
```

---

### Task 10: Site/Machine CRUD Handler & Store

**Files:**
- Create: `internal/site/store.go`, `internal/site/handler.go`

- [ ] **Step 1: Implement site store**

Create `internal/site/store.go`:

```go
package site

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type Site struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	Timezone  string    `json:"timezone"`
	Address   *string   `json:"address"`
	CreatedAt time.Time `json:"created_at"`
}

type ProductionLine struct {
	ID           string    `json:"id"`
	SiteID       string    `json:"site_id"`
	Name         string    `json:"name"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
}

type Machine struct {
	ID        string                 `json:"id"`
	LineID    string                 `json:"line_id"`
	Name      string                 `json:"name"`
	Model     *string                `json:"model"`
	Status    string                 `json:"status"`
	Config    map[string]interface{} `json:"modbus_config"`
	CreatedAt time.Time              `json:"created_at"`
}

func (s *Store) ListSites(ctx context.Context) ([]Site, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name, code, timezone, address, created_at FROM sites ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sites []Site
	for rows.Next() {
		var site Site
		if err := rows.Scan(&site.ID, &site.Name, &site.Code, &site.Timezone, &site.Address, &site.CreatedAt); err != nil {
			return nil, err
		}
		sites = append(sites, site)
	}
	return sites, nil
}

func (s *Store) CreateSite(ctx context.Context, name, code, timezone, address string) (*Site, error) {
	var site Site
	var addr *string
	if address != "" {
		addr = &address
	}
	err := s.db.QueryRow(ctx,
		`INSERT INTO sites (name, code, timezone, address) VALUES ($1, $2, $3, $4)
		 RETURNING id, name, code, timezone, address, created_at`,
		name, code, timezone, addr,
	).Scan(&site.ID, &site.Name, &site.Code, &site.Timezone, &site.Address, &site.CreatedAt)
	return &site, err
}

func (s *Store) ListLinesBySite(ctx context.Context, siteID string) ([]ProductionLine, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, site_id, name, display_order, created_at FROM production_lines WHERE site_id = $1 ORDER BY display_order`,
		siteID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []ProductionLine
	for rows.Next() {
		var line ProductionLine
		if err := rows.Scan(&line.ID, &line.SiteID, &line.Name, &line.DisplayOrder, &line.CreatedAt); err != nil {
			return nil, err
		}
		lines = append(lines, line)
	}
	return lines, nil
}

func (s *Store) ListMachinesByLine(ctx context.Context, lineID string) ([]Machine, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, line_id, name, model, status, modbus_config, created_at FROM machines WHERE line_id = $1 ORDER BY name`,
		lineID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var machines []Machine
	for rows.Next() {
		var m Machine
		var configBytes []byte
		if err := rows.Scan(&m.ID, &m.LineID, &m.Name, &m.Model, &m.Status, &configBytes, &m.CreatedAt); err != nil {
			return nil, err
		}
		if configBytes != nil {
			json.Unmarshal(configBytes, &m.Config)
		}
		machines = append(machines, m)
	}
	return machines, nil
}
```

- [ ] **Step 2: Add missing import to site store**

The file needs `encoding/json` import. Add it to the import block.

- [ ] **Step 3: Implement site handler**

Create `internal/site/handler.go`:

```go
package site

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListSites(w http.ResponseWriter, r *http.Request) {
	sites, err := h.store.ListSites(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sites)
}

func (h *Handler) CreateSite(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Code     string `json:"code"`
		Timezone string `json:"timezone"`
		Address  string `json:"address"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.Code == "" {
		http.Error(w, "name and code are required", http.StatusBadRequest)
		return
	}
	if body.Timezone == "" {
		body.Timezone = "UTC"
	}

	site, err := h.store.CreateSite(r.Context(), body.Name, body.Code, body.Timezone, body.Address)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(site)
}

func (h *Handler) ListLines(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	lines, err := h.store.ListLinesBySite(r.Context(), siteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lines)
}

func (h *Handler) ListMachines(w http.ResponseWriter, r *http.Request) {
	lineID := chi.URLParam(r, "lineID")
	machines, err := h.store.ListMachinesByLine(r.Context(), lineID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(machines)
}
```

- [ ] **Step 4: Verify compilation**

```bash
go build ./...
```

Expected: compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add internal/site/
git commit -m "feat: add site, production line, and machine CRUD store and handler"
```

---

### Task 11: Wire Up Router

**Files:**
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Update main.go to wire all handlers and middleware**

Replace `cmd/server/main.go`:

```go
package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/industry-dashboard/server/internal/audit"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/rbac"
	"github.com/industry-dashboard/server/internal/site"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Parse JWT durations
	accessDuration, _ := time.ParseDuration(cfg.JWTAccessDuration)
	refreshDuration, _ := time.ParseDuration(cfg.JWTRefreshDuration)

	// Services
	jwtService := auth.NewJWTService(cfg.JWTSecret, accessDuration, refreshDuration)
	authMW := auth.NewMiddleware(jwtService)

	rbacStore := rbac.NewStore(pool)
	rbacService := rbac.NewService(rbacStore)
	rbacMW := rbac.NewMiddleware(rbacService)
	rbacHandler := rbac.NewHandler(rbacStore)

	auditStore := audit.NewStore(pool)
	auditMW := audit.NewMiddleware(auditStore)
	auditHandler := audit.NewHandler(auditStore)

	siteStore := site.NewStore(pool)
	siteHandler := site.NewHandler(siteStore)

	// OIDC client (optional — skip if Azure not configured)
	var authHandler *auth.Handler
	if cfg.AzureClientID != "" {
		oidcClient, err := auth.NewOIDCClient(ctx, cfg.AzureTenantID, cfg.AzureClientID, cfg.AzureClientSecret, cfg.AzureRedirectURL)
		if err != nil {
			log.Printf("Warning: OIDC client setup failed: %v (auth endpoints disabled)", err)
		} else {
			authHandler = auth.NewHandler(oidcClient, jwtService, pool)
		}
	}

	// Router
	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Auth routes (public)
	if authHandler != nil {
		r.Route("/api/auth", func(r chi.Router) {
			r.Get("/login", authHandler.Login)
			r.Get("/callback", authHandler.Callback)
			r.Post("/refresh", authHandler.Refresh)
		})
	}

	// Protected API routes
	r.Route("/api", func(r chi.Router) {
		r.Use(authMW.Authenticate)

		// Current user
		if authHandler != nil {
			r.Get("/auth/me", authHandler.Me)
		}

		// Sites
		r.Route("/sites", func(r chi.Router) {
			r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/", siteHandler.ListSites)
			r.With(rbacMW.Require("site:manage", rbac.SiteFromQuery), auditMW.Log("site", "create")).Post("/", siteHandler.CreateSite)
			r.Route("/{siteID}", func(r chi.Router) {
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/lines", siteHandler.ListLines)
			})
		})

		// Lines
		r.Route("/lines/{lineID}", func(r chi.Router) {
			r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/machines", siteHandler.ListMachines)
		})

		// RBAC admin
		r.Route("/rbac", func(r chi.Router) {
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/roles", rbacHandler.ListRoles)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/permissions", rbacHandler.ListPermissions)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/roles/{roleID}/permissions", rbacHandler.GetRolePermissions)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery), auditMW.Log("role", "create")).Post("/roles", rbacHandler.CreateRole)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery), auditMW.Log("user_site_role", "assign")).Post("/assignments", rbacHandler.AssignUserSiteRole)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery), auditMW.Log("user_site_role", "remove")).Delete("/assignments/{id}", rbacHandler.RemoveUserSiteRole)
		})

		// Audit logs
		r.With(rbacMW.Require("audit:view", rbac.SiteFromQuery)).Get("/audit-logs", auditHandler.List)
	})

	log.Printf("Server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
```

- [ ] **Step 2: Install CORS dependency**

```bash
go get github.com/go-chi/cors
go mod tidy
```

- [ ] **Step 3: Verify compilation**

```bash
go build ./...
```

Expected: compiles without errors.

- [ ] **Step 4: Commit**

```bash
git add cmd/server/main.go go.mod go.sum
git commit -m "feat: wire up router — auth, RBAC, audit, site endpoints with middleware chain"
```

---

### Task 12: React Frontend Scaffolding

**Files:**
- Create: `frontend/` directory with Vite + React + TypeScript + Tailwind + shadcn/ui setup

- [ ] **Step 1: Scaffold Vite React project**

```bash
cd /Users/macmini-au/code/industry-dashboard
npm create vite@latest frontend -- --template react-ts
```

- [ ] **Step 2: Install dependencies**

```bash
cd /Users/macmini-au/code/industry-dashboard/frontend
npm install
npm install react-router-dom @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Configure Tailwind**

Update `frontend/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/healthz': 'http://localhost:8080',
    },
  },
})
```

Replace `frontend/src/index.css`:

```css
@import "tailwindcss";
```

- [ ] **Step 4: Set up shadcn/ui**

```bash
cd /Users/macmini-au/code/industry-dashboard/frontend
npx shadcn@latest init
```

Select: New York style, Zinc color, CSS variables.

- [ ] **Step 5: Install commonly needed shadcn components**

```bash
cd /Users/macmini-au/code/industry-dashboard/frontend
npx shadcn@latest add button card table input select dropdown-menu avatar badge separator
```

- [ ] **Step 6: Verify frontend builds**

```bash
cd /Users/macmini-au/code/industry-dashboard/frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/macmini-au/code/industry-dashboard
git add frontend/
git commit -m "feat: scaffold React frontend with Vite, TypeScript, Tailwind, shadcn/ui"
```

---

### Task 13: Frontend Auth & API Layer

**Files:**
- Create: `frontend/src/lib/api.ts`, `frontend/src/lib/auth.ts`

- [ ] **Step 1: Create API client**

Create `frontend/src/lib/api.ts`:

```typescript
const API_BASE = '/api';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  localStorage.setItem('access_token', access);
  localStorage.setItem('refresh_token', refresh);
}

export function loadTokens() {
  accessToken = localStorage.getItem('access_token');
  refreshToken = localStorage.getItem('refresh_token');
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${accessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    }
  }

  return res;
}
```

- [ ] **Step 2: Create auth context**

Create `frontend/src/lib/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch, loadTokens, setTokens, clearTokens, getAccessToken } from './api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for tokens in URL (from OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const access = params.get('access_token');
    const refresh = params.get('refresh_token');
    if (access && refresh) {
      setTokens(access, refresh);
      window.history.replaceState({}, '', '/');
    } else {
      loadTokens();
    }

    // Fetch current user
    if (getAccessToken()) {
      apiFetch('/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setUser(data))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const logout = () => {
    clearTokens();
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd /Users/macmini-au/code/industry-dashboard/frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/macmini-au/code/industry-dashboard
git add frontend/src/lib/
git commit -m "feat: add frontend API client with JWT refresh and auth context provider"
```

---

### Task 14: Frontend App Shell & Routing

**Files:**
- Create: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/layout/TopNav.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Create TopNav component**

Create `frontend/src/components/layout/TopNav.tsx`:

```tsx
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';

export function TopNav() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-slate-900 px-4 text-white">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">Industry Dashboard</h1>
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-sm text-slate-300">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-300 hover:text-white">
              Logout
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create Sidebar component**

Create `frontend/src/components/layout/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Main', items: [
    { to: '/', label: 'Site Overview' },
    { to: '/machines', label: 'Machine List' },
    { to: '/alerts', label: 'Alerts & Alarms' },
    { to: '/reports', label: 'Reports' },
  ]},
  { label: 'Custom', items: [
    { to: '/dashboards', label: 'My Dashboards' },
  ]},
  { label: 'Admin', items: [
    { to: '/admin/users', label: 'User Management' },
    { to: '/admin/roles', label: 'RBAC Settings' },
    { to: '/admin/audit', label: 'Audit Log' },
  ]},
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r bg-slate-50 p-3">
      {navItems.map((group) => (
        <div key={group.label} className="mb-4">
          <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{group.label}</p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'block rounded-md px-3 py-1.5 text-sm',
                  isActive ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
    </aside>
  );
}
```

- [ ] **Step 3: Create AppShell component**

Create `frontend/src/components/layout/AppShell.tsx`:

```tsx
import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex h-screen flex-col">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder pages**

Create `frontend/src/pages/LoginPage.tsx`:

```tsx
import { Button } from '@/components/ui/button';

export function LoginPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-2xl font-bold">Industry Dashboard</h1>
        <Button asChild>
          <a href="/api/auth/login">Sign in with Microsoft</a>
        </Button>
      </div>
    </div>
  );
}
```

Create `frontend/src/pages/DashboardPage.tsx`:

```tsx
import { Card } from '@/components/ui/card';

export function DashboardPage() {
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Site Overview</h2>
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Machines Online</p>
          <p className="text-2xl font-bold text-green-600">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">OEE</p>
          <p className="text-2xl font-bold text-blue-600">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Active Alerts</p>
          <p className="text-2xl font-bold text-red-600">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Today's Output</p>
          <p className="text-2xl font-bold">--</p>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Wire up App.tsx with routing**

Replace `frontend/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              {/* Placeholder routes — pages added in sub-project 3 */}
              <Route path="/machines" element={<div>Machine List (coming soon)</div>} />
              <Route path="/alerts" element={<div>Alerts (coming soon)</div>} />
              <Route path="/reports" element={<div>Reports (coming soon)</div>} />
              <Route path="/dashboards" element={<div>My Dashboards (coming soon)</div>} />
              <Route path="/admin/users" element={<div>User Management (coming soon)</div>} />
              <Route path="/admin/roles" element={<div>RBAC Settings (coming soon)</div>} />
              <Route path="/admin/audit" element={<div>Audit Log (coming soon)</div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Update main.tsx**

Replace `frontend/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Verify frontend builds**

```bash
cd /Users/macmini-au/code/industry-dashboard/frontend
npm run build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
cd /Users/macmini-au/code/industry-dashboard
git add frontend/
git commit -m "feat: add app shell with routing, sidebar, top nav, login page, and placeholder dashboard"
```

---

### Task 15: Add .gitignore and Update CLAUDE.md

**Files:**
- Create: `.gitignore`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Create .gitignore**

Create `.gitignore`:

```
# Go
/server
*.exe

# Frontend
frontend/node_modules/
frontend/dist/

# IDE
.idea/
.vscode/
*.swp

# Environment
.env
.env.local

# Database
pgdata/

# Superpowers
.superpowers/

# OS
.DS_Store
```

- [ ] **Step 2: Update CLAUDE.md with build commands**

Update `CLAUDE.md` to include the build/dev/test commands from the Makefile and frontend.

- [ ] **Step 3: Commit**

```bash
git add .gitignore CLAUDE.md
git commit -m "chore: add .gitignore and update CLAUDE.md with dev commands"
```
