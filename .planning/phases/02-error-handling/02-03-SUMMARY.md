---
phase: 02-error-handling
plan: 03
subsystem: backend/error-handling
tags: [error-handling, apierr, json-api, rbac, llmauth, datapoint, user, audit]
dependency_graph:
  requires:
    - internal/apierr.Write (from Plan 02-01)
  provides:
    - internal/rbac/handler.go — fully migrated to apierr.Write
    - internal/llmauth/handler.go — fully migrated to apierr.Write
    - internal/datapoint/handler.go — fully migrated to apierr.Write
    - internal/user/preference.go — fully migrated to apierr.Write
    - internal/user/handler.go — fully migrated to apierr.Write
    - internal/audit/handler.go — fully migrated to apierr.Write
    - cmd/server/main.go dev routes — fully migrated to apierr.Write
  affects:
    - All 6 handler files now return structured JSON errors
    - Dev routes in main.go now return structured JSON errors
tech_stack:
  added: []
  patterns:
    - apierr.Write(w, r, status, code, message, userID, err) with package-prefixed error codes
    - userID extracted at top of each handler via auth.GetClaims(r.Context())
key_files:
  created: []
  modified:
    - internal/rbac/handler.go
    - internal/llmauth/handler.go
    - internal/datapoint/handler.go
    - internal/user/preference.go
    - internal/user/handler.go
    - internal/audit/handler.go
    - cmd/server/main.go
decisions:
  - Dev routes use "internal" error code (no domain prefix — they don't belong to a domain package)
  - user.invalid_input used for unauthorized-without-claims in preference handler (route is behind auth middleware so this should never fire, but defensive coding)
metrics:
  duration: ~15min
  completed: "2026-03-27"
  tasks: 2
  files: 7
---

# Phase 02 Plan 03: Remaining Handler Files and Dev Routes Conversion Summary

**One-liner:** Converted 6 remaining small handler files and 9 dev route http.Error calls in main.go to structured apierr.Write() with package-prefixed error codes.

## What Was Built

Completed the http.Error migration for the 6 remaining handler files (`rbac`, `llmauth`, `datapoint`, `user/preference`, `user/handler`, `audit`) and converted all dev route inline handlers in `cmd/server/main.go`.

Each handler file received:
1. `apierr` and `auth` imports added
2. `userID` extracted once per handler method via `auth.GetClaims(r.Context())`
3. All `http.Error(w, msg, status)` calls replaced with `apierr.Write(w, r, status, code, message, userID, err)`

Error code prefixes applied per D-03:
- `rbac.invalid_input` — bad request in RBAC handlers
- `llm.invalid_input` — bad request in LLM auth handlers
- `datapoint.invalid_input` — bad request in datapoint handlers
- `user.invalid_input` — bad request/invalid locale in user preference handler
- `audit.*` — audit handler errors (used `internal` for the only 500 case)
- `internal` — all 500 server errors and dev route errors (per D-04)

The dev routes in `cmd/server/main.go` (9 calls total: `/dev/seed`, `/dev/seed-data`, `/dev/login`, and `/api/auth` dev fallback routes) were also converted. These use `internal` as the error code since they are dev-only infrastructure not belonging to a domain package.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Convert 6 remaining handler files | 37b9cd0 | internal/rbac/handler.go, internal/llmauth/handler.go, internal/datapoint/handler.go, internal/user/preference.go, internal/user/handler.go, internal/audit/handler.go |
| 2 | Convert main.go dev routes + verify | 2408947 | cmd/server/main.go |

Note: Plan 02-01 commits (6054601, efa0052, 4aadf00) were cherry-picked into this branch since this worktree started from main which didn't have the apierr package yet.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Cherry-picked Plan 02-01 commits**

- **Found during:** Pre-task setup
- **Issue:** This worktree (agent-af766a88) was created from main branch which didn't have the `internal/apierr` package. The plan depends on `02-01` but the apierr package wasn't present.
- **Fix:** Cherry-picked commits 6054601, efa0052, 4aadf00 from the Plan 02-01 worktree to bring in apierr package, test file, and middleware conversions.
- **Files affected:** internal/apierr/apierr.go, internal/apierr/apierr_test.go, internal/auth/middleware.go, internal/rbac/middleware.go, cmd/server/main.go (RequestID)

**2. [Rule 2 - Missing functionality] Dev route http.Error count was 9, not 4**

- **Found during:** Task 2 implementation
- **Issue:** The plan said "4 http.Error calls in dev routes" but main.go actually had 9 (4 in /dev/seed, /dev/seed-data, /dev/login and 5 in the /api/auth dev fallback routes).
- **Fix:** Converted all 9 calls to apierr.Write.
- **Files modified:** cmd/server/main.go

## Known Stubs

None — all functionality is fully implemented.

## Verification Results

```
grep -c "http.Error" internal/rbac/handler.go         → 0
grep -c "http.Error" internal/llmauth/handler.go      → 0
grep -c "http.Error" internal/datapoint/handler.go    → 0
grep -c "http.Error" internal/user/preference.go      → 0
grep -c "http.Error" internal/user/handler.go         → 0
grep -c "http.Error" internal/audit/handler.go        → 0
grep -c "http.Error" cmd/server/main.go               → 0
grep -c "apierr.Write" cmd/server/main.go             → 9
go build ./...                                        → PASS
go test ./internal/rbac/... ./internal/user/... ./internal/audit/... ./internal/apierr/... → PASS
```

## Self-Check: PASSED

- internal/rbac/handler.go exists: FOUND
- internal/llmauth/handler.go exists: FOUND
- internal/datapoint/handler.go exists: FOUND
- internal/user/preference.go exists: FOUND
- internal/user/handler.go exists: FOUND
- internal/audit/handler.go exists: FOUND
- Commits 37b9cd0, 2408947: FOUND
- Zero http.Error in all 7 plan-scope files: CONFIRMED
