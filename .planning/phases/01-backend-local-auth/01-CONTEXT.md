# Phase 1: Backend Local Auth - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver backend endpoints for local email/password registration and login, producing valid JWTs accepted by the existing RBAC/audit middleware. Includes rate limiting, a providers discovery endpoint, and a default admin account seeded on first run.

</domain>

<decisions>
## Implementation Decisions

### Registration Flow
- **D-01:** Registration requires email + password only. Display name derived from email prefix (everything before @). Can be edited later.
- **D-02:** No password complexity requirements — no minimum length, no character mix rules. Just accept whatever the user provides.
- **D-03:** Email clash with existing SSO account: Claude's discretion — recommend blocking registration and returning a clear error ("email already in use, log in via SSO to link your account"). This is safer and avoids the dual-account merge problem. Aligns with nOAuth prevention (STATE.md decision).

### Role Assignment
- **D-04:** No Guest role. Self-registered users get the existing **Viewer** role automatically.
- **D-05:** Viewer role assigned with global scope (site_id = NULL in user_site_roles). Admin can restrict to specific sites later.

### Providers Endpoint
- **D-06:** GET /api/auth/providers is dynamic based on config — always includes "local", includes "microsoft" only when Azure env vars are configured. This prevents showing a broken SSO button when Microsoft isn't set up.

### Default Admin Account
- **D-07:** On first server startup, if the users table is empty, create a default admin account with email `admin` and password `default` (bcrypt hashed). Assign Admin role with global scope.
- **D-08:** This is a first-run-only check — if the admin is deleted later, it won't be recreated.

### Claude's Discretion
- Login endpoint design: POST /api/auth/login/local with email + password body, returns same cookie pair as OIDC flow (access_token + refresh_token). Claude decides exact request/response shape.
- Dummy bcrypt on not-found login path to prevent timing-based email enumeration (carried from STATE.md milestone decision).
- New endpoints should use structured {code, message} JSON errors from the start, even though the full error handling sweep is Phase 2.
- Rate limiting implementation details (httprate middleware, limits per endpoint).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth System
- `internal/auth/handler.go` — Current OIDC auth handler, upsertUser, cookie pattern, JWT issuance
- `internal/auth/jwt.go` — JWTService (auth-method-agnostic: CreateAccessToken takes userID + email)
- `internal/auth/oidc.go` — OIDCClient for Microsoft Entra ID
- `internal/auth/middleware.go` — Auth middleware extracting JWT from cookies

### Database Schema
- `migrations/002_create_auth.up.sql` — Users table with `password_hash VARCHAR(255)` already present
- `migrations/009_seed_permissions.up.sql` — Existing roles (Admin, Manager, Operator, Viewer) and permissions

### Route Wiring
- `cmd/server/main.go` — Route registration, auth handler nil-guard pattern, dev mode bypass

### Research
- `.planning/research/STACK.md` — Stack decisions (bcrypt, httprate)
- `.planning/research/PITFALLS.md` — Security pitfalls (nOAuth, timing attacks, email enumeration)
- `.planning/research/ARCHITECTURE.md` — Integration architecture and build order

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `JWTService.CreateAccessToken(userID, email)` / `CreateRefreshToken(userID, email)` — fully reusable, no OIDC dependency
- Cookie-setting pattern in `handler.go:Callback` (access_token + refresh_token with HttpOnly/SameSite) — replicate for local login
- `upsertUser` pattern — reference for local user insert, but local auth needs a different insert path (no microsoft_id conflict)
- Viewer role already exists with permissions: dashboard:view, machine:view, datapoint:view, alert:view

### Established Patterns
- Handler struct with `*pgxpool.Pool` + service dependencies
- Route registration in `cmd/server/main.go` with chi router groups
- Auth middleware reads JWT from `access_token` cookie — local auth JWTs are identical
- `http.Error()` for error responses (Phase 2 will sweep to structured JSON, but new endpoints should start with structured errors)

### Integration Points
- `cmd/server/main.go` line 122: `if authHandler != nil` guard — local auth routes must be registered regardless of OIDC config
- `internal/auth/handler.go` Handler struct — extend with local auth methods or create parallel handler
- `golang.org/x/crypto` already in go.mod as indirect dep — promote to direct for bcrypt usage
- user_site_roles table for Viewer role assignment on registration

</code_context>

<specifics>
## Specific Ideas

- Default admin: email=`admin`, password=`default` — created on first startup only if users table is empty
- No password rules at all — user explicitly said "不用設限" (no restrictions)
- Registration derives display name from email prefix (part before @)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-backend-local-auth*
*Context gathered: 2026-03-27*
