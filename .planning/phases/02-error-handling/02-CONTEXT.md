# Phase 2: Error Handling - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Standardize all backend API error responses to the structured `{code, message}` JSON shape and ensure every error is captured in system logs with full request context (request ID, user ID, path, method). This is a backend-only sweep — frontend error display is Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Error Response Shape & Shared Package
- **D-01:** Promote `internal/auth/errors.go` (`apiError` struct + `writeError()`) to a new shared package `internal/apierr`. All handlers import from there.
- **D-02:** Keep the `{code, message}` shape — RFC 7807 was explicitly rejected (STATE.md decision).
- **D-03:** Error codes use dot-prefix style matching the package: `auth.invalid_input`, `site.not_found`, `alert.invalid_request`, `dashboard.not_found`, etc. Phase 1 already established this pattern in `internal/auth/local.go`.
- **D-04:** `internal` is used as the code for unexpected server errors (e.g., database failures) — already established in Phase 1.

### Structured Logging Strategy
- **D-05:** Add `chiMiddleware.RequestID` to the middleware chain in `cmd/server/main.go` to generate a unique request ID per request.
- **D-06:** Every error response must also log via `slog.Error()` with these fields: `request_id`, `user_id` (from JWT context, empty string if unauthenticated), `path`, `method`, `error_code`, and the underlying error message.
- **D-07:** The shared `writeError()` function should handle both the JSON response AND the slog call — single call site for error handling, no possibility of logging without responding or vice versa.

### Error Code Catalog
- **D-08:** Each package defines its own error codes with a consistent prefix. No central registry file — the code itself is the catalog.
- **D-09:** Granularity: one code per distinct error condition (e.g., `auth.email_taken` vs `auth.invalid_credentials`), not one code per handler.

### Migration Approach
- **D-10:** Package-by-package migration of all 162 `http.Error()` calls across 15 files. `internal/auth` is already done (Phase 1 reference).
- **D-11:** Replace `http.Error()` calls directly — no wrapper or compatibility shim. Clean cut.

### Claude's Discretion
- Exact function signature for the shared `writeError()` — whether it takes `*http.Request` for logging context or extracts it from context
- Whether to add a `WriteErrorWithDetails()` variant for validation errors that need field-level detail
- Order of package migration (suggest: auth middleware/rbac first since they're in the request path, then domain handlers)
- Whether error codes should be string constants or just inline strings

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Error Shape (source of truth)
- `internal/auth/errors.go` — Current `apiError` struct and `writeError()` to promote to shared package
- `internal/auth/local.go` — Reference implementation of structured error responses (all `writeError()` calls)

### Middleware Chain
- `cmd/server/main.go` — Route registration, middleware chain (Logger, Recoverer — RequestID needs to be added)
- `internal/auth/middleware.go` — Auth middleware with `http.Error()` calls to convert
- `internal/rbac/middleware.go` — RBAC middleware with `http.Error()` calls to convert
- `internal/audit/middleware.go` — Audit middleware

### Domain Handlers (all need conversion)
- `internal/site/handler.go` — 43 `http.Error()` calls (largest)
- `internal/alert/handler.go` — 20 calls
- `internal/worker_config/handler.go` — 19 calls
- `internal/worker_api/handler.go` — 16 calls
- `internal/dashboard/handler.go` — 15 calls
- `internal/rbac/handler.go` — 10 calls
- `internal/llmauth/handler.go` — 6 calls
- `internal/auth/handler.go` — 11 calls (OIDC handler, separate from local.go)
- `internal/datapoint/handler.go` — 4 calls
- `internal/user/preference.go` — 4 calls
- `internal/user/handler.go` — 1 call
- `internal/audit/handler.go` — 1 call

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `internal/auth/errors.go` — `apiError{code, message}` struct + `writeError(w, status, code, message)` — promote to shared `internal/apierr`
- `chiMiddleware.RequestID` — available from chi (already imported as `chiMiddleware`), just not used yet
- `internal/auth/middleware.go` — extracts user ID from JWT context, pattern reusable for logging enrichment

### Established Patterns
- Handler struct with `*pgxpool.Pool` + service dependencies
- `chiMiddleware.Logger` and `chiMiddleware.Recoverer` already in middleware chain
- Auth context stores user ID via `context.WithValue` in auth middleware — available for slog enrichment
- `slog` used in some files (worker, coordinator) but not consistently for HTTP error logging

### Integration Points
- `cmd/server/main.go` line 112-113: middleware chain — insert `chiMiddleware.RequestID` before Logger
- All 15 handler files listed above — each `http.Error()` call becomes `apierr.Write()` or similar
- `internal/auth/local.go` already uses the target pattern — no changes needed there

</code_context>

<specifics>
## Specific Ideas

- User said "up to you" for all areas — Claude has full discretion on implementation details within the {code, message} shape constraint
- Error shape `{code, message}` is a locked decision from STATE.md — not negotiable
- No toast notifications — inline error display (but that's Phase 3 frontend concern)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-error-handling*
*Context gathered: 2026-03-27*
