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

### Fake Worker
```bash
make fake-worker      # Run fake worker with default config (cmd/fake-worker/config.yaml)
make fake-worker-config CONFIG=path/to/config.yaml  # Run with custom config
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
cmd/fake-worker/          # Fake Modbus worker for testing
internal/
  auth/                    # JWT, OIDC, auth middleware
  rbac/                    # Custom roles, permissions, RBAC middleware
  audit/                   # Audit trail middleware and store
  site/                    # Site/line/machine CRUD
  alert/                   # Alert CRUD and alert events
  user/                    # User listing with role details
  datapoint/               # Time-series data queries, aggregations
  dashboard/               # Custom dashboard CRUD, widget management, access control
  config/                  # Env-based configuration
  worker/                  # Worker coordination, data generation, alert evaluation
  database/                # DB connection pool
```

### Middleware Chain
All protected API routes pass through: **Auth (JWT) → RBAC (permission check) → Audit (log mutating requests)**

### Key Design Decisions
- **json-render** (not yet implemented) will let users customize dashboards via natural language — OpenAI generates layout specs constrained to a widget catalog
- RBAC uses custom roles with permission sets, scoped per site via `user_site_roles` table
- Audit logs are append-only with JSONB details
- Fake worker (`cmd/fake-worker`) generates simulated sensor data for testing; real Modbus workers will share the same `internal/worker` coordination layer

## i18n (Internationalization)

Supports 4 languages: English (`en`), Traditional Chinese (`zh-TW`), Thai (`th`), Vietnamese (`vi`).

### How it works
- **Frontend:** `react-i18next` with static JSON locale files imported at build time
- **Backend:** Stores user locale preference in `users.locale` column; served via `GET /api/auth/me` and updated via `PATCH /api/me/preferences`
- **Flow:** User picks language in TopNav dropdown → `i18n.changeLanguage()` updates UI instantly → `PATCH /api/me/preferences` persists to DB → on next login, saved locale is restored from `/api/auth/me`

### Key files
| Area | Files |
|------|-------|
| Locale JSON | `frontend/src/locales/{en,zh-TW,th,vi}.json` |
| i18n init | `frontend/src/lib/i18n.ts` |
| Language switcher | `frontend/src/components/layout/TopNav.tsx` |
| Locale restore on login | `frontend/src/lib/auth.tsx` |
| API hook | `frontend/src/lib/hooks.ts` → `useUpdateLocale()` |
| Backend handler | `internal/user/preference.go` |
| Store methods | `internal/user/store.go` → `ValidLocales`, `GetUserLocale`, `UpdateUserLocale` |
| DB migration | `migrations/012_add_user_locale.{up,down}.sql` |

### Adding a new language
1. Create `frontend/src/locales/<code>.json` (copy `en.json`, translate values)
2. Import it in `frontend/src/lib/i18n.ts` and add to `resources`
3. Add `{ code: '<code>', label: '<native name>' }` to the `languages` array in `TopNav.tsx`
4. Add `"<code>": true` to `ValidLocales` in `internal/user/store.go`

### Adding a new translatable string
1. Add the key to **all 4** locale JSON files (`en.json`, `zh-TW.json`, `th.json`, `vi.json`)
2. Use `t('section.key')` in the component (import `useTranslation` from `react-i18next`)
3. For interpolation: `t('section.key', { varName: value })` with `"key": "text {{varName}}"` in JSON
