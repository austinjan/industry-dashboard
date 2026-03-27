# Phase 2: Error Handling - Research

**Researched:** 2026-03-27
**Domain:** Go HTTP error standardization, structured logging with slog, chi middleware
**Confidence:** HIGH

## Summary

Phase 2 is a backend-only sweep that converts 162 `http.Error()` calls across 15 files into structured `{code, message}` JSON responses, and adds `slog`-based error logging enriched with request ID and user ID. The pattern already exists in `internal/auth` from Phase 1 — the work is promotion of that package's `errors.go` to a shared `internal/apierr` package, followed by systematic replacement in every other handler and middleware file.

The chi `RequestID` middleware is already in the dependency (`github.com/go-chi/chi/v5 v5.2.1`, confirmed installed). `chiMiddleware.GetReqID(ctx)` retrieves the ID after it is registered. Go 1.21+ standard library `slog` is available (project uses go 1.25.0, actual toolchain is 1.26.1). No new dependencies are required.

The `writeError()` function in `internal/auth/errors.go` is the exact source of truth to promote. The only design questions are its signature extension for slog and whether to expose constants for error codes. Both are Claude's discretion per CONTEXT.md.

**Primary recommendation:** Create `internal/apierr` with a single `Write(w, r, status, code, message)` function that handles JSON response AND `slog.Error()` in one call. Extract request ID via `chiMiddleware.GetReqID(r.Context())` and user ID via `auth.GetClaims(r.Context())` inside the function. Migrate in order: shared package first, then middleware (auth, rbac), then domain handlers largest-to-smallest.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Promote `internal/auth/errors.go` (`apiError` struct + `writeError()`) to new shared package `internal/apierr`. All handlers import from there.
- **D-02:** Keep the `{code, message}` shape — RFC 7807 was explicitly rejected (STATE.md decision).
- **D-03:** Error codes use dot-prefix style: `auth.invalid_input`, `site.not_found`, `alert.invalid_request`, `dashboard.not_found`, etc. Phase 1 already established this pattern in `internal/auth/local.go`.
- **D-04:** `internal` is used as the code for unexpected server errors (e.g., database failures) — already established in Phase 1.
- **D-05:** Add `chiMiddleware.RequestID` to the middleware chain in `cmd/server/main.go` to generate a unique request ID per request.
- **D-06:** Every error response must also log via `slog.Error()` with these fields: `request_id`, `user_id` (from JWT context, empty string if unauthenticated), `path`, `method`, `error_code`, and the underlying error message.
- **D-07:** The shared `writeError()` function should handle both the JSON response AND the slog call — single call site for error handling.
- **D-08:** Each package defines its own error codes with a consistent prefix. No central registry file.
- **D-09:** Granularity: one code per distinct error condition, not one code per handler.
- **D-10:** Package-by-package migration of all 162 `http.Error()` calls across 15 files. `internal/auth` is already done (Phase 1 reference).
- **D-11:** Replace `http.Error()` calls directly — no wrapper or compatibility shim. Clean cut.

### Claude's Discretion
- Exact function signature for the shared `writeError()` — whether it takes `*http.Request` for logging context or extracts it from context
- Whether to add a `WriteErrorWithDetails()` variant for validation errors that need field-level detail
- Order of package migration (suggest: auth middleware/rbac first since they're in the request path, then domain handlers)
- Whether error codes should be string constants or just inline strings

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ERR-01 | Backend uses structured JSON error responses ({code, message}) across all handlers | `internal/apierr.Write()` replaces all 162 `http.Error()` calls; existing pattern from Phase 1 confirmed correct |
| ERR-03 | All errors are captured in system logs with structured logging (slog) and request context | `slog.Error()` with `chiMiddleware.GetReqID` + `auth.GetClaims` provides request_id and user_id fields; slog is stdlib in Go 1.21+ |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `log/slog` | stdlib (Go 1.21+) | Structured logging | No external dep; key-value pairs; standard in modern Go |
| `github.com/go-chi/chi/v5/middleware` | v5.2.1 (already imported) | `RequestID` middleware + `GetReqID()` | Already in go.mod; `chiMiddleware` alias already used in main.go |
| `encoding/json` | stdlib | JSON error response serialization | Already used in `internal/auth/errors.go` |

### No New Dependencies
All required functionality is covered by the existing dependency set. This phase requires zero new `go get` invocations.

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure Addition
```
internal/
├── apierr/
│   └── apierr.go        # Shared error writer — single source of truth
├── auth/
│   ├── errors.go        # DELETE or repurpose to re-export from apierr (keep package compiling)
│   └── ...
└── (all other packages import internal/apierr)
```

### Pattern 1: Shared apierr.Write() Signature

**What:** A single function that writes the JSON error body and logs via slog in one call.

**When to use:** Every `http.Error()` replacement and every new error path.

**Recommended signature:**
```go
// Source: internal/auth/errors.go (Phase 1 reference, to be promoted)
package apierr

import (
    "encoding/json"
    "log/slog"
    "net/http"

    chiMiddleware "github.com/go-chi/chi/v5/middleware"
    "github.com/industry-dashboard/server/internal/auth"
)

type apiError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

// Write writes a structured JSON error response and logs via slog.
// Takes *http.Request to extract request_id and user_id for logging.
// err is the underlying error for the log (may be nil for client errors).
func Write(w http.ResponseWriter, r *http.Request, status int, code, message string, err error) {
    // Log with full context
    userID := ""
    if claims := auth.GetClaims(r.Context()); claims != nil {
        userID = claims.UserID
    }
    slog.Error("api error",
        "request_id", chiMiddleware.GetReqID(r.Context()),
        "user_id",    userID,
        "method",     r.Method,
        "path",       r.URL.Path,
        "error_code", code,
        "error",      err,
    )
    // Write JSON response
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(apiError{Code: code, Message: message})
}
```

**Key decision to make:** Whether `err error` is always required (forcing callers to pass `nil` for client errors like bad input) or whether to provide two variants. The single-function approach with nullable `err` is simpler and keeps callers consistent.

### Pattern 2: chiMiddleware.RequestID insertion

**What:** Insert `chiMiddleware.RequestID` BEFORE `chiMiddleware.Logger` in `cmd/server/main.go` so the Logger middleware can include the request ID in its output.

**When to use:** One-time change to `cmd/server/main.go`.

```go
// Source: cmd/server/main.go line 111-113 (current state)
r.Use(chiMiddleware.RequestID)   // ADD — before Logger
r.Use(chiMiddleware.Logger)
r.Use(chiMiddleware.Recoverer)
```

`chiMiddleware.GetReqID(ctx)` returns `""` safely if `RequestID` middleware hasn't run (e.g., in tests). No nil-safety needed.

### Pattern 3: Per-package error code naming

**What:** Each handler package uses its own prefix, matching the domain. No central registry — the code inline in each handler is the catalog per D-08.

**Examples from Phase 1 (auth package):**
- `auth.invalid_input` — bad request body or missing fields
- `auth.invalid_credentials` — wrong email/password
- `auth.email_taken` — duplicate registration
- `auth.password_too_long` — exceeds 72-char bcrypt limit
- `auth.account_disabled` — inactive account
- `internal` — unexpected server error (db failure, etc.)

**New packages to define:**
- `site.*` — `site.not_found`, `site.invalid_input`, `site.code_exists`
- `alert.*` — `alert.not_found`, `alert.invalid_input`, `alert.invalid_request`
- `dashboard.*` — `dashboard.not_found`, `dashboard.invalid_input`
- `rbac.*` — `rbac.not_found`, `rbac.invalid_input`
- `worker.*` — `worker.not_found`, `worker.invalid_input`
- `datapoint.*` — `datapoint.invalid_input`
- `user.*` — `user.invalid_input`
- `audit.*` — `audit.invalid_input`
- `llm.*` — `llm.invalid_input`, `llm.not_found`

### Pattern 4: auth/errors.go migration

After `internal/apierr` is created, `internal/auth/errors.go` has two clean options:

**Option A:** Delete `errors.go` entirely and update all callers in `internal/auth/*.go` to use `apierr.Write()` instead of package-local `writeError()`. This is the correct approach per D-11 (clean cut, no shim).

**Option B:** Thin re-export shim. Less clean — contradicts D-11.

**Recommendation:** Option A. The auth package already uses `writeError()` only in `local.go` and `handler.go` — two files, manageable update.

### Anti-Patterns to Avoid

- **http.Error() for JSON APIs:** Sends `text/plain` content-type, no machine-readable code. Every replacement must use `apierr.Write()`.
- **Logging without responding:** `slog.Error()` alone without writing the response, or vice versa. The combined `apierr.Write()` makes this impossible.
- **Logging after WriteHeader:** `slog.Error()` inside `apierr.Write()` must run before `w.WriteHeader()` (it does — log first, then write).
- **Swallowing internal errors without logging:** Client 4xx errors (bad input) should still log for visibility — pass `nil` as the underlying error for non-server errors, or omit the `err` field. Server 5xx must always pass the actual error.
- **Inserting RequestID after Logger:** Logger uses RequestID — it must come first in the chain.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request ID generation | Custom UUID/ULID generator | `chiMiddleware.RequestID` | Already in dependency; generates host-prefixed sequential IDs; extractable via `GetReqID()` |
| Structured log fields | Custom log struct | `log/slog` stdlib | Key-value structured logging; zero-cost fields; JSON output compatible |
| Error response encoding | Custom response writer | `encoding/json` + `apierr.Write()` | One shared function eliminates divergence risk |

**Key insight:** The entire infrastructure already exists. The work is wiring and systematic replacement, not building new components.

## Common Pitfalls

### Pitfall 1: Partial Migration (Compilation Succeeds, Behavior Wrong)
**What goes wrong:** Some handlers convert, others stay as `http.Error()`. Tests pass, but some endpoints return plain text.
**Why it happens:** Go compiles fine with mixed usage; no type system enforcement.
**How to avoid:** After implementing `apierr`, run `grep -rn "http\.Error" internal/` as a verification step. Zero results = complete migration.
**Warning signs:** Any `http.Error` remaining in `internal/` after migration.

### Pitfall 2: RequestID Not in Context for Middleware Errors
**What goes wrong:** Auth and RBAC middleware fire before RequestID is set if ordering is wrong, causing empty `request_id` in logs.
**Why it happens:** Chi middleware runs in registration order. If `chiMiddleware.Logger` comes before `chiMiddleware.RequestID`, the Logger sees no ID, and auth errors logged in `apierr.Write()` also see no ID.
**How to avoid:** Order in `main.go` must be: `RequestID` → `Logger` → `Recoverer` → `cors`.
**Warning signs:** `request_id: ""` in logs for requests that go through auth middleware.

### Pitfall 3: auth.GetClaims Returns nil for Unauthenticated Paths
**What goes wrong:** `apierr.Write()` panics or returns wrong user_id when called from auth middleware itself (before claims are set).
**Why it happens:** Auth middleware calls `writeError()` when there is no valid token — claims context key is not set yet.
**How to avoid:** The nil-guard `if claims := auth.GetClaims(r.Context()); claims != nil` inside `apierr.Write()` handles this correctly. Default user_id to `""` (empty string) per D-06.
**Warning signs:** Panic in auth middleware on unauthenticated requests.

### Pitfall 4: Circular Import Between apierr and auth
**What goes wrong:** `internal/apierr` imports `internal/auth` (for `GetClaims`), and `internal/auth` imports `internal/apierr` (for `Write`). Go compile error: import cycle.
**Why it happens:** Both packages need each other.
**How to avoid:** Two clean options:
  - **Option A (recommended):** `apierr.Write()` accepts `userID string` as a parameter — callers extract claims themselves before calling. No import of `internal/auth` needed in `apierr`.
  - **Option B:** Extract the claims-extraction into a separate `contextkey` or `ctxutil` package that both `auth` and `apierr` can import.

**Recommended resolution:** Option A — `apierr.Write(w, r, status, code, message string, userID string, err error)`. Each handler calls `auth.GetClaims(r.Context())` and passes `claims.UserID` (or `""` if nil). This keeps `apierr` dependency-free from domain packages.

**Revised signature:**
```go
// internal/apierr/apierr.go — no import of internal/auth
func Write(w http.ResponseWriter, r *http.Request, status int, code, message, userID string, err error)
```

### Pitfall 5: dev routes in main.go still use http.Error()
**What goes wrong:** The `/dev/seed`, `/dev/seed-data`, and `/dev/login` routes in `cmd/server/main.go` use `http.Error()` directly. These are gated by `DEV_MODE=1` so they don't affect production, but they are inconsistent.
**Why it happens:** Dev routes are inline closures in main.go, not in a handler package.
**How to avoid:** Per D-11 (clean cut, no shim), these should also be converted. They are in `main` package — they can call `apierr.Write()` directly. There are 4 calls.
**Warning signs:** `grep -rn "http\.Error" cmd/` returns results after migration.

### Pitfall 6: Existing log.Printf calls in auth/local.go remain after migration
**What goes wrong:** `internal/auth/local.go` uses `log.Printf()` before calling `writeError()`. After migration to `apierr.Write()`, those `log.Printf()` calls become redundant because `apierr.Write()` now handles logging.
**Why it happens:** Phase 1 implementation used `log.Printf` + `writeError` as two separate calls — a pattern `apierr.Write()` intentionally collapses.
**How to avoid:** When migrating `auth/local.go`, remove the standalone `log.Printf` calls wherever they precede a `writeError()` → `apierr.Write()` replacement.
**Warning signs:** Double-logging the same error (once from `log.Printf`, once from `apierr.Write()`).

## Code Examples

### Verified Pattern: Current auth/errors.go (Phase 1 reference)
```go
// Source: internal/auth/errors.go (current, to be promoted)
type apiError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(apiError{Code: code, Message: message})
}
```

### Target Pattern: apierr.Write() with slog (recommended design)
```go
// Source: design from CONTEXT.md D-06, D-07
// internal/apierr/apierr.go
package apierr

import (
    "encoding/json"
    "log/slog"
    "net/http"

    chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

type apiError struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

// Write writes a structured JSON error response and logs it via slog.
// userID should be claims.UserID if authenticated, "" if not.
// err is the underlying error for logging; pass nil for client-side errors.
func Write(w http.ResponseWriter, r *http.Request, status int, code, message, userID string, err error) {
    slog.Error("api error",
        "request_id", chiMiddleware.GetReqID(r.Context()),
        "user_id",    userID,
        "method",     r.Method,
        "path",       r.URL.Path,
        "error_code", code,
        "error",      err,
    )
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(apiError{Code: code, Message: message})
}
```

### Target Pattern: Caller side (after migration)
```go
// In any handler — before:
http.Error(w, "internal error", http.StatusInternalServerError)

// After:
claims := auth.GetClaims(r.Context())
userID := ""
if claims != nil { userID = claims.UserID }
apierr.Write(w, r, http.StatusInternalServerError, "internal", "Internal error", userID, err)
```

### Target Pattern: RequestID middleware insertion
```go
// Source: chi v5.2.1 middleware docs; CONTEXT.md D-05
// cmd/server/main.go — replace lines 112-113:
r.Use(chiMiddleware.RequestID)  // ADDED first
r.Use(chiMiddleware.Logger)
r.Use(chiMiddleware.Recoverer)
```

### Target Pattern: chiMiddleware.GetReqID usage (verified)
```go
// Source: /Users/macmini-au/go/pkg/mod/github.com/go-chi/chi/v5@v5.2.1/middleware/request_id.go:83
// Returns "" safely when RequestID middleware hasn't run (e.g., tests)
requestID := chiMiddleware.GetReqID(r.Context())
```

## Migration Scope (Confirmed Call Counts)

Verified by `grep -c "http\.Error"` against current codebase:

| File | http.Error calls | Priority |
|------|-----------------|----------|
| `internal/site/handler.go` | 43 | High (largest) |
| `internal/alert/handler.go` | 20 | High |
| `internal/worker_config/handler.go` | 19 | High |
| `internal/worker_api/handler.go` | 16 | High |
| `internal/dashboard/handler.go` | 15 | High |
| `internal/rbac/handler.go` | 10 | Medium |
| `internal/auth/handler.go` | 11 | Medium (OIDC handler) |
| `internal/auth/middleware.go` | 5 | High (in request path) |
| `internal/rbac/middleware.go` | 3 | High (in request path) |
| `internal/llmauth/handler.go` | 6 | Medium |
| `internal/datapoint/handler.go` | 4 | Medium |
| `internal/user/preference.go` | 4 | Medium |
| `internal/user/handler.go` | 1 | Low |
| `internal/audit/handler.go` | 1 | Low |
| `cmd/server/main.go` | 4 | Low (DEV_MODE only) |
| **TOTAL** | **162** | |

**Note:** `internal/auth/local.go` is already done (Phase 1) — 0 remaining `http.Error()` calls there.

**Recommended migration order:**
1. Create `internal/apierr/apierr.go` (new package, no callers yet)
2. Convert `internal/auth/middleware.go` (5 calls) and `internal/rbac/middleware.go` (3 calls) — in request path
3. Convert `internal/auth/handler.go` (11 calls) + update `internal/auth/local.go` (remove standalone `log.Printf`, adopt `apierr.Write`) + delete `internal/auth/errors.go`
4. Convert domain handlers in order: `site` (43), `alert` (20), `worker_config` (19), `worker_api` (16), `dashboard` (15), `rbac` (10)
5. Convert remaining small handlers: `llmauth` (6), `datapoint` (4), `user/preference` (4), `user/handler` (1), `audit` (1)
6. Convert `cmd/server/main.go` dev routes (4)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `log.Printf` for structured logging | `log/slog` (stdlib) | Go 1.21 (Aug 2023) | Key-value pairs, JSON output, no external dep |
| `http.Error()` plain text | `{code, message}` JSON | Phase 1 established pattern | Machine-readable, frontend-consumable |
| Per-package error writers | Shared `internal/apierr` | Phase 2 goal | Single import, consistent logging |

**Deprecated/outdated in this codebase:**
- `http.Error()`: writes `text/plain`, no structured code field — replaced by `apierr.Write()`
- `log.Printf()` for HTTP errors: unstructured, no request context — replaced by slog inside `apierr.Write()`

## Open Questions

1. **Circular import resolution approach**
   - What we know: `apierr` needs user_id from auth claims; `auth` needs `apierr` for error writing
   - What's unclear: Whether Option A (pass userID as string param) is acceptable verbosity at all call sites
   - Recommendation: Use Option A (userID as param). It's explicit, testable, and avoids import cycles. The verbosity is a helper pattern that each package handles consistently.

2. **String constants vs inline strings for error codes**
   - What we know: Phase 1 uses inline strings (`"auth.invalid_input"` literal). D-09 says one code per distinct condition.
   - What's unclear: Whether the planner should define constants (e.g., `const ErrInvalidInput = "auth.invalid_input"`) per package
   - Recommendation: Inline strings are fine for this scale. Constants add indirection without benefit unless codes are shared across packages (they are not, per D-08). Keep inline.

3. **slog output format (text vs JSON)**
   - What we know: `slog` defaults to text format; JSON format requires `slog.New(slog.NewJSONHandler(os.Stderr, nil))`
   - What's unclear: Whether structured JSON log output is needed now or is Phase 3+
   - Recommendation: Use default slog (text) for now. The key-value fields are already structured and parseable. Switching to JSON handler is a one-line change when needed.

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes within the existing Go codebase. No external dependencies, services, or CLI tools beyond the existing Go toolchain are required.

## Validation Architecture

`workflow.nyquist_validation` is not set in `.planning/config.json` — treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Go testing + testify v1.10.0 |
| Config file | none — `go test ./...` convention |
| Quick run command | `make test` (runs `go test ./...`) |
| Full suite command | `make test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ERR-01 | `apierr.Write()` returns `Content-Type: application/json` and `{code, message}` JSON body | unit | `go test ./internal/apierr/... -v` | ❌ Wave 0 |
| ERR-01 | No `http.Error()` calls remain in `internal/` or `cmd/` | static check | `grep -rn "http\.Error" internal/ cmd/` returns 0 lines | N/A — shell verify |
| ERR-01 | Auth middleware errors return structured JSON | unit | `go test ./internal/auth/... -run TestAuthMiddleware -v` | ✅ `middleware_test.go` (needs response body assertion update) |
| ERR-03 | `apierr.Write()` calls `slog.Error()` with request_id, user_id, path, method fields | unit | `go test ./internal/apierr/... -run TestWrite_LogFields -v` | ❌ Wave 0 |
| ERR-03 | request_id propagates from RequestID middleware to apierr log | integration | `go test ./internal/auth/... -run TestAuthMiddleware_RequestID -v` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `go test ./internal/apierr/... -v`
- **Per wave merge:** `make test`
- **Phase gate:** `make test` green + `grep -rn "http\.Error" internal/ cmd/server/main.go` returns 0 lines

### Wave 0 Gaps
- [ ] `internal/apierr/apierr_test.go` — covers ERR-01 (JSON shape) and ERR-03 (slog fields)
- [ ] Capture slog output in tests: use `slog.New(slog.NewTextHandler(&buf, nil))` temporarily or check log output via `slog.SetDefault`

*(Existing `middleware_test.go` tests check status code only — response body assertions for `{code, message}` shape need to be added as part of the auth middleware conversion task.)*

## Project Constraints (from CLAUDE.md)

- Backend: Go with chi router, pgx for Postgres
- No new external dependencies introduced (this phase uses only stdlib slog + existing chi middleware)
- All API changes must be checked against `cmd/dashboard-cli/` — however this phase does not change endpoint signatures (only response error bodies), so CLI updates are not required
- After any endpoint body format change, verify frontend `apiFetch` error handling still works — but this is Phase 3 scope per CONTEXT.md

## Sources

### Primary (HIGH confidence)
- `internal/auth/errors.go` — source of truth for `apiError` struct and `writeError()` function
- `internal/auth/local.go` — reference implementation of Phase 1 error pattern
- `go/pkg/mod/github.com/go-chi/chi/v5@v5.2.1/middleware/request_id.go` — verified `GetReqID()` signature and behavior
- `go.mod` — confirmed chi v5.2.1, Go 1.25.0 module (toolchain 1.26.1 installed)
- `.planning/phases/02-error-handling/02-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- `grep -c "http.Error"` results on current codebase — 162 total calls confirmed across 15 files
- `grep "chiMiddleware\."` in main.go — confirmed `chiMiddleware` alias already used, `RequestID` just not yet registered
- `grep -rn "slog"` — confirmed zero existing slog usage in internal/ (all uses are `log.Printf`)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs verified in go.mod and module cache
- Architecture: HIGH — based on existing codebase and verified chi API
- Pitfalls: HIGH — circular import risk is a known Go pattern; request ID ordering verified against chi source
- Migration scope: HIGH — call counts verified by grep against current files

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable — no fast-moving dependencies)
