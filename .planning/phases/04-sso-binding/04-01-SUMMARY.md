---
phase: 04-sso-binding
plan: 01
subsystem: auth
tags: [go, oidc, microsoft-entra, jwt, audit, pgx, postgres]

# Dependency graph
requires:
  - phase: 01-backend-local-auth
    provides: local auth handlers, Handler struct, OIDCClient, JWT service, registered_via column
  - phase: 02-error-handling
    provides: apierr.Write structured errors, slog logging
provides:
  - GET /api/auth/bind/microsoft endpoint (authenticated, initiates Azure OIDC bind flow)
  - GET /api/auth/bind/callback endpoint (authenticated, completes bind, updates microsoft_id + microsoft_email)
  - Migration 023 adding microsoft_email column to users
  - AzureBindRedirectURL config field (AZURE_BIND_REDIRECT_URL env var)
  - OIDCClient.AuthURLWithRedirect and ExchangeWithRedirect methods for bind-specific redirect URL
  - Extended GET /api/auth/me response with has_microsoft bool, registered_via string, microsoft_email nullable
  - AuditLogger interface in auth package with sso_bind audit logging
  - auditLoggerAdapter in main.go bridging audit.Store to auth.AuditLogger
affects:
  - 04-02-frontend (account page consuming /api/auth/me and bind endpoints)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separate oauth_bind_state cookie from oauth_state to avoid collision between login and bind CSRF flows"
    - "AuditLogger interface in auth package avoids circular import with audit package — bridged via adapter in main.go"
    - "AuthURLWithRedirect / ExchangeWithRedirect on OIDCClient override redirect_uri per call without a second OIDC client"
    - "Bind callback extracts user ID from JWT claims (not OIDC response) to enforce user-initiated requirement"
    - "Goroutine for audit log in bind callback to avoid blocking redirect, with slog.Error on failure"

key-files:
  created:
    - migrations/023_add_microsoft_email.up.sql
    - migrations/023_add_microsoft_email.down.sql
    - internal/auth/bind.go
  modified:
    - internal/config/config.go
    - internal/auth/oidc.go
    - internal/auth/handler.go
    - cmd/server/main.go

key-decisions:
  - "oauth_bind_state cookie used for bind CSRF (not oauth_state) to avoid collision with login flow"
  - "AuditLogger interface defined in auth package to avoid circular import; adapted in main.go"
  - "Bind callback uses JWT claims for user identity, NOT OIDC response (nOAuth prevention)"
  - "Dashboard-CLI check: bind endpoints are browser-only OIDC redirects, /auth/me extension is additive — no CLI changes needed"

patterns-established:
  - "AuditLogger interface pattern: define minimal interface in consuming package, implement via adapter in main.go"
  - "ExchangeWithRedirect: copies oauth2.Config struct to override RedirectURL without mutating shared state"

requirements-completed: [SSO-01, SSO-02]

# Metrics
duration: 8min
completed: 2026-03-31
---

# Phase 4 Plan 1: SSO Binding Backend Summary

**Microsoft SSO bind flow with per-call redirect URL override, CSRF state cookie, 23505 unique violation handling, and sso_bind audit logging via interface adapter pattern**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-31T07:40:00Z
- **Completed:** 2026-03-31T07:43:44Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Created migration 023 adding `microsoft_email` column to users table
- Added `AzureBindRedirectURL` config field with `AZURE_BIND_REDIRECT_URL` env var
- Added `AuthURLWithRedirect` and `ExchangeWithRedirect` methods to OIDCClient for bind-specific redirect URL without a second OIDC client instance
- Created `internal/auth/bind.go` with `BindMicrosoft` and `BindCallback` handlers, `AuditLogger` interface, and `extractIP` helper
- Extended `Me()` handler to return `has_microsoft`, `registered_via`, and `microsoft_email` fields
- Added `auditLoggerAdapter` at package level in `cmd/server/main.go` bridging `audit.Store` to `auth.AuditLogger`
- Wired bind routes under `/api/auth` with `authMW.Authenticate` protection
- Verified Dashboard-CLI compliance: bind endpoints are browser-only redirects, `/auth/me` extension is additive

## Task Commits

1. **Task 1: Migration, config, and OIDCClient method for bind redirect URL** - `3609cf4` (feat)
2. **Task 2: Bind handlers, Me() extension, audit interface, route wiring** - `d6c3651` (feat)

## Files Created/Modified

- `migrations/023_add_microsoft_email.up.sql` - Adds microsoft_email VARCHAR(255) column to users
- `migrations/023_add_microsoft_email.down.sql` - Drops microsoft_email column
- `internal/config/config.go` - Added AzureBindRedirectURL field with AZURE_BIND_REDIRECT_URL env var
- `internal/auth/oidc.go` - Added AuthURLWithRedirect and ExchangeWithRedirect methods
- `internal/auth/bind.go` - AuditLogger interface, BindMicrosoft, BindCallback, extractIP handlers
- `internal/auth/handler.go` - Extended Handler struct with bindRedirectURL/auditLogger, updated NewHandler signature, extended Me() query
- `cmd/server/main.go` - Added auditLoggerAdapter struct+method, updated authHandler construction, added bind routes

## Decisions Made

- **oauth_bind_state vs oauth_state**: Separate cookie name avoids CSRF collision with the login flow state cookie
- **AuditLogger interface in auth package**: Avoids circular import between auth and audit packages; adapter pattern in main.go bridges the gap cleanly
- **ExchangeWithRedirect copies oauth2.Config**: Avoids mutating the shared oauth2Config struct — copies it, overrides RedirectURL on the copy
- **Dashboard-CLI compliance confirmed**: Bind endpoints are browser-only OIDC redirects (not suitable for CLI), and /auth/me is additive backward-compatible extension

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

New environment variable available (optional):
- `AZURE_BIND_REDIRECT_URL` — defaults to `http://localhost:8080/api/auth/bind/callback`. Must be registered as a redirect URI in the Azure AD app registration for production.

## Next Phase Readiness

- Backend API surface complete: `/api/auth/bind/microsoft`, `/api/auth/bind/callback`, extended `/api/auth/me`
- Frontend account page (Plan 04-02) can consume these endpoints
- Migration 023 will run automatically on next server start

---
*Phase: 04-sso-binding*
*Completed: 2026-03-31*
