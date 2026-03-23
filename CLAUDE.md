# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Industry Dashboard - a customizable multi-factory industrial monitoring dashboard for production lines, machine status, and operational metrics. Users configure what to monitor; AI generates UI layouts via json-render.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite, shadcn/ui + Tailwind CSS, TanStack Query, react-router-dom
- **Backend:** Go (chi router, pgx for Postgres)
- **Database:** TimescaleDB (PostgreSQL + time-series extension)
- **Auth:** Microsoft Entra ID (Azure AD) via OIDC, JWT sessions
- **RBAC:** Custom roles with permission sets, scoped per site

## Build & Dev Commands

### Backend (Go)
```bash
make dev              # Run the Go server (port 8080)
make test             # Run all Go tests
make test-one TEST=TestName PKG=internal/auth  # Run a single test
make db-up            # Start TimescaleDB via Docker
make db-down          # Stop database
make migrate          # Run all migrations
make migrate-down     # Roll back one migration
go build ./...        # Verify compilation
```

### Frontend (React)
```bash
cd frontend
npm run dev           # Start Vite dev server (port 5173, proxies /api to :8080)
npm run build         # Production build
npm run lint          # Lint
```

## Architecture

### Backend Structure
```
cmd/server/main.go        # Entry point — wires all handlers and middleware
internal/
  auth/                    # JWT, OIDC, auth middleware
  rbac/                    # Custom roles, permissions, RBAC middleware
  audit/                   # Audit trail middleware and store
  site/                    # Site/line/machine CRUD
  alert/                   # Alert CRUD and alert events
  user/                    # User listing with role details
  datapoint/               # Time-series data queries, aggregations
  config/                  # Env-based configuration
  database/                # DB connection pool
```

### Middleware Chain
All protected API routes pass through: **Auth (JWT) → RBAC (permission check) → Audit (log mutating requests)**

### Key Design Decisions
- **json-render** (not yet implemented) will let users customize dashboards via natural language — OpenAI generates layout specs constrained to a widget catalog
- RBAC uses custom roles with permission sets, scoped per site via `user_site_roles` table
- Audit logs are append-only with JSONB details
- Modbus workers (not yet implemented) will be a separate binary, distributed via DB-based coordination
