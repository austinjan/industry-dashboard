---
phase: 01-backend-local-auth
plan: 01
subsystem: auth
tags: [bcrypt, golang, password-hashing, migration, timescaledb, postgres]

requires: []
provides:
  - HashPassword, CheckPassword, DummyCheckPassword functions in internal/auth/password.go
  - writeError structured error helper in internal/auth/errors.go
  - Migration 022 adding registered_via column to users table
  - github.com/go-chi/httprate and golang.org/x/crypto as direct dependencies

affects:
  - 01-02 (auth handlers depend on password utilities and writeError)
  - 01-03 (wiring depends on schema change and utilities)

tech-stack:
  added:
    - github.com/go-chi/httprate v0.15.0 (rate limiting, promoted to direct)
    - golang.org/x/crypto v0.49.0 (bcrypt, promoted to direct)
  patterns:
    - bcrypt cost 12 for password hashing
    - Pre-computed dummy hash for timing-safe not-found path
    - Structured JSON errors as {code, message} (RFC 7807 rejected)

key-files:
  created:
    - internal/auth/password.go
    - internal/auth/errors.go
    - migrations/022_add_registered_via.up.sql
    - migrations/022_add_registered_via.down.sql
  modified:
    - go.mod
    - go.sum

key-decisions:
  - "bcrypt cost 12 chosen for password hashing (good security/performance balance)"
  - "Pre-computed dummy hash prevents timing-based email enumeration on not-found login path"
  - "Error shape is {code, message} — RFC 7807 explicitly rejected in favour of simpler shape"
  - "registered_via column defaults to 'microsoft' so all existing SSO users are correctly categorised"

patterns-established:
  - "Password utilities: HashPassword/CheckPassword/DummyCheckPassword pattern for local auth"
  - "writeError(w, status, code, message) as standard JSON error response across new auth handlers"

requirements-completed: [AUTH-01, AUTH-02]

duration: 5min
completed: 2026-03-27
---

# Phase 01 Plan 01: Backend Local Auth Foundation Summary

**bcrypt password utilities (cost 12, dummy timing protection) and structured error helper added to package auth; migration 022 adds registered_via column to users table**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-27T09:34:00Z
- **Completed:** 2026-03-27T09:37:18Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `internal/auth/password.go` with HashPassword, CheckPassword, DummyCheckPassword (bcrypt cost 12) and pre-computed dummy hash for timing-safe not-found path
- Created `internal/auth/errors.go` with writeError helper producing {code, message} JSON errors
- Created migration 022 that adds `registered_via VARCHAR(20) NOT NULL DEFAULT 'microsoft'` to users table (existing SSO rows get correct default, new local registrations will set 'local')
- Promoted `golang.org/x/crypto` and `github.com/go-chi/httprate` to direct dependencies in go.mod

## Task Commits

Each task was committed atomically:

1. **Task 1: Add dependencies, create password utilities and error helper** - `ccdc35a` (feat)
2. **Task 2: Create migration 022 for registered_via column** - `2cd3bf0` (feat)

## Files Created/Modified

- `internal/auth/password.go` - HashPassword, CheckPassword, DummyCheckPassword with bcrypt cost 12
- `internal/auth/errors.go` - writeError structured JSON error helper, apiError struct
- `migrations/022_add_registered_via.up.sql` - Adds registered_via column with default 'microsoft'
- `migrations/022_add_registered_via.down.sql` - Drops registered_via column
- `go.mod` - Promoted x/crypto and httprate to direct deps
- `go.sum` - Updated checksums

## Decisions Made

- bcrypt cost 12 provides strong security while remaining performant for typical auth load
- Pre-computed dummy hash at package init avoids first-request latency on the not-found timing guard
- Error shape {code, message} kept simple — RFC 7807 problem details explicitly rejected per project decisions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - `go get` marked both packages as indirect initially; moved them to the direct require block in go.mod to satisfy the acceptance criteria. All existing auth tests continued to pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (auth handlers for register/login/logout) can proceed immediately — password.go and errors.go are available in package auth
- Plan 03 (wiring) requires migration 022 to be applied to the database before testing register/login flows
- Blocker from STATE.md: authHandler NewHandler nil-safety for local-only deployments still needs assessment before Plan 01-03

---
*Phase: 01-backend-local-auth*
*Completed: 2026-03-27*
