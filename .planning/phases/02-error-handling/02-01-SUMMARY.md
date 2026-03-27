---
phase: 02-error-handling
plan: 01
subsystem: backend/apierr
tags: [error-handling, middleware, slog, json-api, apierr]
dependency_graph:
  requires: []
  provides:
    - internal/apierr.Write — shared JSON error writer with slog logging
    - chiMiddleware.RequestID — request ID propagation to all middleware
  affects:
    - internal/auth/middleware.go — converted to apierr.Write
    - internal/rbac/middleware.go — converted to apierr.Write
tech_stack:
  added:
    - internal/apierr (new package)
  patterns:
    - apierr.Write(w, r, status, code, message, userID, err) for all API errors
    - chi RequestID middleware first in chain for request correlation
key_files:
  created:
    - internal/apierr/apierr.go
    - internal/apierr/apierr_test.go
  modified:
    - cmd/server/main.go
    - internal/auth/middleware.go
    - internal/rbac/middleware.go
decisions:
  - Error shape stays {code, message} — consistent with prior decision (no RFC 7807)
  - apierr does not import internal/auth to avoid circular import; userID passed as string
  - RBAC middleware extracts userID from claims before calling apierr.Write for better log correlation
  - rbac.internal_error added as error code for HasPermission failures (was plain "internal error")
metrics:
  duration: ~15min
  completed: "2026-03-27"
  tasks: 2
  files: 5
---

# Phase 02 Plan 01: apierr Package and Middleware Conversion Summary

**One-liner:** Shared `apierr.Write()` function combining JSON error responses with slog logging, plus RequestID middleware and middleware layer conversion.

## What Was Built

Created `internal/apierr` package with a single exported function `Write()` that handles all API error responses uniformly. The function logs structured error fields via slog (request_id, user_id, method, path, error_code, error) then writes a `{"code": "...", "message": "..."}` JSON body with the correct HTTP status code.

Added `chiMiddleware.RequestID` as the first middleware in `cmd/server/main.go` so that every request has a correlation ID available to all subsequent middleware and handlers.

Converted both middleware files that are in every authenticated request path:
- `internal/auth/middleware.go`: 5 `http.Error` calls replaced with `apierr.Write` using `auth.unauthorized` and `auth.read_only_key` codes
- `internal/rbac/middleware.go`: 3 `http.Error` calls replaced with `apierr.Write` using `rbac.unauthorized`, `rbac.forbidden`, and `rbac.internal_error` codes

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 (RED) | Failing tests for apierr.Write | 6054601 | internal/apierr/apierr_test.go |
| 1 (GREEN) | Implement apierr.Write | efa0052 | internal/apierr/apierr.go |
| 2 | Add RequestID, convert middleware | 4aadf00 | cmd/server/main.go, internal/auth/middleware.go, internal/rbac/middleware.go |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] RBAC middleware now logs userID from claims**

- **Found during:** Task 2 implementation
- **Issue:** Plan specified extracting userID from claims for RBAC errors. The original code used `http.Error` with no user context. The new implementation extracts `userID := claims.UserID` before the permission check, enabling better error log correlation when a forbidden response is returned.
- **Fix:** Added `userID := claims.UserID` extracted from claims and passed to all `apierr.Write` calls in RBAC middleware.
- **Files modified:** internal/rbac/middleware.go
- **Commit:** 4aadf00

**2. [Rule 2 - Missing functionality] rbac.internal_error code for HasPermission failures**

- **Found during:** Task 2 implementation
- **Issue:** The original RBAC middleware returned `http.Error(w, "internal error", http.StatusInternalServerError)` for DB errors in permission checks with no error code. The plan only specified codes for 401/403 cases.
- **Fix:** Added `rbac.internal_error` code and passed the underlying `err` to `apierr.Write` so permission check failures are properly logged with the error value.
- **Files modified:** internal/rbac/middleware.go
- **Commit:** 4aadf00

## Known Stubs

None — all functionality is fully implemented.

## Verification Results

```
go test ./internal/apierr/... -v    → PASS (6 tests)
go test ./internal/auth/... -v      → PASS (10 tests)
go test ./internal/rbac/... -v      → PASS (3 tests)
go build ./...                      → PASS (0 errors)
grep http.Error internal/auth/middleware.go internal/rbac/middleware.go → 0 results
```

## Self-Check: PASSED

- internal/apierr/apierr.go exists: FOUND
- internal/apierr/apierr_test.go exists: FOUND
- Commits 6054601, efa0052, 4aadf00: FOUND
- RequestID before Logger: CONFIRMED (line 107 before line 108)
- Zero http.Error in middleware files: CONFIRMED
