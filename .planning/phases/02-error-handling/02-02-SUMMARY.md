---
phase: 02-error-handling
plan: 02
subsystem: api
tags: [go, apierr, error-handling, structured-errors, slog]

# Dependency graph
requires:
  - phase: 02-01
    provides: apierr.Write function and middleware conversion foundation
provides:
  - Auth package migrated to apierr.Write (handler.go, local.go), errors.go deleted
  - site/handler.go: 43 apierr.Write calls with site.* error codes
  - alert/handler.go: 20 apierr.Write calls with alert.* error codes
  - worker_config/handler.go: 19 apierr.Write calls with worker.* error codes
  - worker_api/handler.go: 16 apierr.Write calls with worker.* error codes
  - dashboard/handler.go: 15 apierr.Write calls with dashboard.* error codes
affects: [02-03-error-handling, all future API handlers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "All handler methods extract userID at top via auth.GetClaims, pass to apierr.Write"
    - "4xx client errors pass nil as err parameter; 5xx internal errors pass actual err"
    - "Package-prefixed error codes: site.*, alert.*, worker.*, dashboard.*, auth.*, internal"

key-files:
  created: []
  modified:
    - internal/auth/handler.go
    - internal/auth/local.go
    - internal/site/handler.go
    - internal/alert/handler.go
    - internal/worker_config/handler.go
    - internal/worker_api/handler.go
    - internal/dashboard/handler.go
  deleted:
    - internal/auth/errors.go

key-decisions:
  - "writeError/apiError in auth package deleted entirely — clean cut per D-11, no shim left behind"
  - "UserID always extracted per-method (not globally) to support handlers with mixed auth requirements"
  - "alert.invalid_request used for unauthorized access in alert handlers (vs alert.invalid_input for body parsing)"

patterns-established:
  - "Pattern: userID extraction at top of each handler method via auth.GetClaims"
  - "Pattern: 4xx = nil err, 5xx = actual err in apierr.Write calls"
  - "Pattern: remove standalone log.Printf before error writes to prevent double-logging"

requirements-completed: [ERR-01, ERR-03]

# Metrics
duration: 20min
completed: 2026-03-27
---

# Phase 02 Plan 02: Domain Handler Error Migration Summary

**124 http.Error calls across 7 files converted to apierr.Write with package-prefixed structured error codes and slog logging**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-27T11:00:00Z
- **Completed:** 2026-03-27T11:20:04Z
- **Tasks:** 2
- **Files modified:** 7 (+ 1 deleted)

## Accomplishments
- Auth package fully migrated: handler.go converted (11 http.Error -> apierr.Write), local.go converted (18 writeError -> apierr.Write), errors.go deleted
- 5 domain handlers converted: site (43), alert (20), worker_config (19), worker_api (16), dashboard (15) — all using apierr.Write with package-prefixed codes
- Eliminated double-logging: all standalone log.Printf calls before error writes removed
- Zero http.Error calls remaining in converted packages

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert auth package — handler.go, local.go, delete errors.go** - `496385b` (feat)
2. **Task 2: Convert 5 large domain handlers (site, alert, worker_config, worker_api, dashboard)** - `eadb26d` (feat)

## Files Created/Modified
- `internal/auth/handler.go` - 11 http.Error -> apierr.Write with auth.* codes
- `internal/auth/local.go` - 18 writeError -> apierr.Write, 5 log.Printf removed
- `internal/auth/errors.go` - DELETED (writeError/apiError consolidated into apierr package)
- `internal/site/handler.go` - 43 http.Error -> apierr.Write with site.* codes
- `internal/alert/handler.go` - 20 http.Error -> apierr.Write with alert.* codes
- `internal/worker_config/handler.go` - 19 http.Error -> apierr.Write with worker.* codes
- `internal/worker_api/handler.go` - 16 http.Error -> apierr.Write with worker.* codes
- `internal/dashboard/handler.go` - 15 http.Error -> apierr.Write with dashboard.* codes

## Decisions Made
- `writeError`/`apiError` in auth package deleted entirely (clean cut, D-11) — no shim
- `alert.invalid_request` used for unauthorized access in alert handlers to distinguish from body parsing errors
- UserID extracted per-method (not globally) since some handlers have mixed auth requirements

## Deviations from Plan

### Setup Deviation — Worktree Branch Behind Main

**Found during:** Initial setup
- **Issue:** Worktree branch `worktree-agent-ac5a1794` was branched from old `origin/main` (5a45b1c), missing Phase 01 code and the apierr package from 02-01. The main local branch had all work, and the 02-01 code was on another worktree branch.
- **Fix:** Merged `main` into the worktree branch (fast-forward), then cherry-picked the 3 code commits from `worktree-agent-a30bfebc` (02-01 work: test, feat, feat commits).
- **Verification:** `go build ./...` passed after setup.
- **Classification:** Setup issue, not a plan deviation.

None - plan executed exactly as written once setup was complete.

## Issues Encountered
- Worktree needed to be synchronized with main + 02-01 code before execution could begin. Resolved by merging main and cherry-picking 02-01 code commits.

## Next Phase Readiness
- 124 of 162 total http.Error calls eliminated (76%)
- Only ~18 calls remain in small handlers and dev routes (covered by Plan 03)
- All existing tests pass, go build ./... exits 0

## Self-Check: PASSED

All files confirmed present/deleted as expected. Both task commits verified. `go build ./...` passes.
