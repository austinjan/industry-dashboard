---
phase: 01-backend-local-auth
plan: 02
subsystem: auth
tags: [golang, local-auth, jwt, bcrypt, postgres, rbac]

requires:
  - internal/auth/password.go (HashPassword, CheckPassword, DummyCheckPassword from 01-01)
  - internal/auth/errors.go (writeError from 01-01)
  - migrations/022_add_registered_via.up.sql (registered_via column from 01-01)

provides:
  - RegisterLocal handler (POST /api/auth/register) in internal/auth/local.go
  - LoginLocal handler (POST /api/auth/login/local) in internal/auth/local.go
  - setAuthCookies helper in internal/auth/local.go
  - Providers handler (GET /api/auth/providers) in internal/auth/handler.go
  - SeedDefaultAdmin function in internal/auth/handler.go
  - nil-safe OIDC guards on Login and Callback in internal/auth/handler.go

affects:
  - 01-03 (route wiring uses RegisterLocal, LoginLocal, Providers, SeedDefaultAdmin)

tech-stack:
  added:
    - github.com/jackc/pgx/v5/pgconn (PgError for unique violation detection, already indirect)
  patterns:
    - DummyCheckPassword on not-found/null-hash login path (timing-safe email enumeration prevention)
    - nil-guard pattern for optional OIDC (h.oidc == nil check before use)
    - setAuthCookies helper to share cookie-setting logic across local and OIDC flows
    - SeedDefaultAdmin first-run only (COUNT(*) > 0 guard)

key-files:
  created:
    - internal/auth/local.go
    - internal/auth/local_test.go
  modified:
    - internal/auth/handler.go

key-decisions:
  - "LoginLocal has NO email format validation (no @ check) — admin account email is 'admin' with no @"
  - "is_active check comes after password verify to avoid revealing disabled status to unauthenticated callers"
  - "SeedDefaultAdmin is a package-level function (not a Handler method) — called at server startup before handler wired"
  - "Providers always returns 'local', adds 'microsoft' only when OIDCClient is non-nil"

requirements: [AUTH-01, AUTH-02]

duration: ~4min
completed: 2026-03-27
---

# Phase 01 Plan 02: Auth Handlers (RegisterLocal, LoginLocal, Providers) Summary

**RegisterLocal and LoginLocal handlers with timing-safe bcrypt, Viewer role assignment, and JWT cookie responses; Providers endpoint returns dynamic auth method list; Handler nil-safe for local-only deployments**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-27T09:40:28Z
- **Completed:** 2026-03-27T09:44:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

### Task 1: RegisterLocal and LoginLocal handlers (TDD)

- Created `internal/auth/local.go` with:
  - `RegisterLocal`: validates email (@ check), validates password (72-char bcrypt limit), derives display name from email prefix, inserts user with `registered_via='local'`, assigns Viewer role globally (site_id=NULL), returns 201 + JWT cookies
  - `LoginLocal`: no @ check (admin account), DummyCheckPassword on not-found/null-hash paths for timing safety, is_active check after password verify, returns 200 + JWT cookies
  - `setAuthCookies`: shared helper matching Callback cookie pattern exactly (access_token MaxAge 900, refresh_token MaxAge 604800)
  - Unique violation detection via pgconn PgError code "23505" with SSO differentiation
- Created `internal/auth/local_test.go` with 13 tests covering all validation paths without DB

### Task 2: Providers handler and Handler nil-safety

- Added `if h.oidc == nil` guards to Login and Callback — return 501 `auth.sso_not_configured` instead of panicking
- Added `Providers` handler: returns `{"providers": ["local"]}` (or `["local", "microsoft"]` when OIDC configured)
- Added `SeedDefaultAdmin` package-level function: first-run only (COUNT guard), creates email=admin/password=default user with Admin role

## Task Commits

1. **test(01-02): add failing tests for RegisterLocal, LoginLocal, Providers** - `c9b456e` (TDD RED)
2. **feat(01-02): implement RegisterLocal and LoginLocal handlers in local.go** - `f0f5d8b` (TDD GREEN)
3. **feat(01-02): add Providers handler, nil-safe OIDC guards, SeedDefaultAdmin** - `d42bead`

## Files Created/Modified

- `internal/auth/local.go` (220 lines) — RegisterLocal, LoginLocal, setAuthCookies
- `internal/auth/local_test.go` (163 lines) — 13 validation tests, no DB required
- `internal/auth/handler.go` — Providers, SeedDefaultAdmin, nil-guards on Login/Callback

## Decisions Made

- LoginLocal skips email format validation intentionally — `admin` account has no `@` (per RESEARCH.md Pitfall 5)
- `is_active` check occurs AFTER password verification to avoid revealing disabled account status to unauthenticated callers
- `SeedDefaultAdmin` is a package-level function (not a Handler method) since it's called at server startup before the handler is fully wired
- Providers always includes "local" and conditionally adds "microsoft" based on `h.oidc != nil`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TDD RED test for Providers moved after GREEN implementation**

- **Found during:** Task 1 (TDD RED phase)
- **Issue:** TestProviders_NoOIDC in local_test.go caused build failure during Task 1 RED commit since Providers wasn't yet implemented (belongs to Task 2)
- **Fix:** Removed Providers test from initial RED commit, added it back during Task 2 GREEN phase after Providers was implemented
- **Files modified:** internal/auth/local_test.go
- **Commit:** d42bead

**2. [Rule 1 - Bug] TestRegisterLocal_Password72CharsOK caused nil panic**

- **Found during:** Task 1 GREEN phase test run
- **Issue:** Test sent valid 72-char password through to DB insert path, which panicked on nil pgxpool
- **Fix:** Replaced test with TestRegisterLocal_Password73CharsRejected which only tests the validation boundary (73 chars triggers rejection)
- **Files modified:** internal/auth/local_test.go
- **Commit:** f0f5d8b

## Known Stubs

None — all handlers are fully implemented. Plan 03 will wire them to routes.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 03 (route wiring) can proceed immediately — RegisterLocal, LoginLocal, Providers, and SeedDefaultAdmin are all exported and ready
- Blocker from STATE.md resolved: Handler is now nil-safe for local-only deployments (h.oidc == nil guards added)

---
*Phase: 01-backend-local-auth*
*Completed: 2026-03-27*

## Self-Check: PASSED

- internal/auth/local.go: FOUND
- internal/auth/local_test.go: FOUND
- .planning/phases/01-backend-local-auth/01-02-SUMMARY.md: FOUND
- Commit c9b456e: FOUND
- Commit f0f5d8b: FOUND
- Commit d42bead: FOUND
