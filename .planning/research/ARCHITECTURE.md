# Architecture Patterns

**Domain:** Local authentication, SSO binding, error handling — integration with existing industrial dashboard
**Researched:** 2026-03-27
**Confidence:** HIGH — based on direct codebase analysis

---

## Existing Architecture Baseline

### Users Table (already has the right columns)

`migrations/002_create_auth.up.sql` already contains:

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    microsoft_id VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),   -- already exists, currently unused
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Key insight:** `password_hash` column already exists in the schema. No migration needed for the column itself — but a new migration is needed to add `email_verified` and `registration_token` columns.

### Auth Flow (current)

```
Browser → GET /api/auth/login
       → redirect to Microsoft OIDC
       → POST /api/auth/callback (code exchange)
       → upsertUser() by microsoft_id
       → JWT access+refresh cookies set
       → redirect to /
```

### JWT/RBAC integration points

`JWTService.CreateAccessToken(userID, email string)` — takes only user UUID and email. No auth-method discriminator in JWT claims. This is good: local auth produces the same JWT shape, so all downstream middleware (RBAC, audit) works without modification.

`auth.Middleware.Authenticate` — reads cookie or Authorization header, validates JWT, puts `*Claims{UserID, Email, TokenType}` in context. No changes needed for local auth — local auth just produces the same JWT.

`rbac.Middleware.Require(permission, siteExtractor)` — reads `claims.UserID` from context. No changes needed.

`audit.Middleware.Log` — reads `claims.UserID` from context. No changes needed.

---

## New Components Required

### 1. DB Migration: `022_local_auth_fields.up.sql`

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;
```

Why: Microsoft SSO users are implicitly verified (email comes from Entra). Local registrants need email verification or can be marked verified immediately (simpler for v0.0.3 — skip verification email, just mark verified on registration). The column is still useful for future email verification flows.

Also needed: a `Guest` role in the roles seed. Check if `Guest` exists; if not, add a migration to seed it.

```sql
INSERT INTO roles (name, description, is_system) VALUES
    ('Guest', 'Read-only access, no site assignment by default', true)
ON CONFLICT (name) DO NOTHING;
```

### 2. `internal/auth/local.go` — Local Auth Handler

New file within existing `internal/auth` package. Adds three HTTP handlers:

| Handler | Route | Description |
|---------|-------|-------------|
| `RegisterLocal` | `POST /api/auth/register` | Create account, assign Guest role, issue JWT |
| `LoginLocal` | `POST /api/auth/login/local` | Verify password, issue JWT |
| `BindMicrosoft` | `POST /api/auth/bind/microsoft` | **Authenticated** — link Microsoft identity to existing local account |

`RegisterLocal` flow:
```
Parse {email, password, name}
→ validate inputs (email format, password length >= 8)
→ check email uniqueness (conflict = 409)
→ bcrypt hash password
→ INSERT user (email, name, password_hash, is_active=true, email_verified=true)
→ assign Guest role via user_site_roles (site_id=NULL, role=Guest)
→ CreateAccessToken + CreateRefreshToken
→ set cookies (same as OIDC callback)
→ 201 JSON {id, email, name}
```

`LoginLocal` flow:
```
Parse {email, password}
→ SELECT user WHERE email = $1
→ if not found → 401 (do NOT distinguish "no account" from "wrong password")
→ if password_hash IS NULL → 401 with message "account uses SSO login"
→ bcrypt.CompareHashAndPassword
→ if mismatch → 401
→ if !is_active → 403
→ CreateAccessToken + CreateRefreshToken
→ set cookies
→ 200 JSON {id, email, name}
```

`BindMicrosoft` flow (protected route — requires existing JWT):
```
[Auth middleware validates existing JWT]
Parse incoming OIDC code from body
→ oidcClient.Exchange(code)  [reuses existing OIDCClient]
→ check: is microsoft_id already bound to another user? → 409
→ UPDATE users SET microsoft_id = $1 WHERE id = $2
→ 200 JSON {status: "bound"}
```

### 3. Modify `internal/auth/handler.go` — OIDC Upsert Logic

Current `upsertUser` uses `ON CONFLICT (microsoft_id)`. When local accounts exist, a Microsoft login for an email that already has a local account should bind them together, not create a duplicate.

New logic:
```sql
-- Try to find existing user by microsoft_id first
-- If not found, try to find by email
-- If found by email: update microsoft_id (bind)
-- If not found: INSERT new user
-- If microsoft_id conflict: UPDATE email/name
```

Concretely, replace `upsertUser` with a two-step approach:

```go
// Step 1: try exact microsoft_id match
// Step 2: if not found, try email match and update microsoft_id
// Step 3: if neither, insert new user
```

This ensures a user who registered locally with their work email can subsequently log in via Microsoft SSO without ending up with two accounts.

### 4. Modify `internal/auth/handler.go` — Handler Constructor

`NewHandler` currently requires `*OIDCClient`. For local-auth-only deployments (no Azure config), the `oidcClient` is nil. The `BindMicrosoft` handler also needs access to `OIDCClient` — this is already provided via the existing `Handler` struct.

No constructor change needed. `BindMicrosoft` is only registered when `authHandler != nil` (i.e., when Azure is configured).

### 5. `internal/auth/password.go` — Password Utilities

New file in `internal/auth`:

```go
package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

func HashPassword(plain string) (string, error) {
    b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
    return string(b), err
}

func CheckPassword(hash, plain string) bool {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
```

Dependency: `golang.org/x/crypto` — already likely present (check go.mod). If not, `go get golang.org/x/crypto`.

### 6. `cmd/server/main.go` — Route Registration Changes

Current pattern:
```go
if authHandler != nil {
    r.Route("/api/auth", func(r chi.Router) {
        r.Get("/login", authHandler.Login)      // Microsoft SSO
        r.Get("/callback", authHandler.Callback)
        r.Post("/refresh", authHandler.Refresh)
        r.Post("/logout", authHandler.Logout)
    })
}
```

New pattern — local auth routes are always registered, SSO routes only when Azure configured:

```go
// Local auth routes — always available
r.Post("/api/auth/register", authHandler.RegisterLocal)
r.Post("/api/auth/login/local", authHandler.LoginLocal)

// Shared routes — always available (handler handles nil oidcClient for refresh/logout)
r.Post("/api/auth/refresh", authHandler.Refresh)
r.Post("/api/auth/logout", authHandler.Logout)

// SSO routes — only when Azure configured
if cfg.AzureClientID != "" {
    r.Get("/api/auth/login", authHandler.Login)
    r.Get("/api/auth/callback", authHandler.Callback)
}

// Protected: bind Microsoft to existing account
r.With(authMW.Authenticate).Post("/api/auth/bind/microsoft/callback", authHandler.BindMicrosoftCallback)
```

`authHandler` needs to be always constructable (even without `OIDCClient`). Refactor `NewHandler` to accept `oidc *OIDCClient` as optional (nil-safe).

### 7. Frontend: `LoginPage.tsx` — Add Local Auth Form

Replace the current single-button page with a tabbed or stacked layout:

```
[Email/Password Form]
  - Email input
  - Password input
  - [Sign In] button
  - "Don't have an account? Register"

[or]

[Sign in with Microsoft] button (only rendered when SSO is available)
```

The frontend needs a way to know whether Microsoft SSO is configured. Options:
- **Option A (recommended):** Add `GET /api/auth/providers` endpoint returning `{local: true, microsoft: bool}` — simple, no env var leaking to frontend.
- **Option B:** Check at runtime whether `/api/auth/login` (the SSO redirect) is a 404 — works but ugly.
- **Option C:** Embed a flag in the initial HTML served — over-engineering for this scale.

Use Option A. `GET /api/auth/providers` is always-public, no auth required.

### 8. Frontend: `RegisterPage.tsx` — New Page

New route `/register`. Form fields: name, email, password, confirm password. On success, redirect to `/` (or `/login` with a toast).

### 9. Frontend: Account Settings — SSO Binding

Existing `TopNav.tsx` has a user dropdown. Add an "Account Settings" page or modal at `/account` where a logged-in user (who has no `microsoft_id`) can:
1. Click "Link Microsoft Account"
2. Get redirected to OIDC with a special `prompt` parameter or a state token indicating bind intent
3. Callback detects bind intent → calls `POST /api/auth/bind/microsoft/callback` instead of creating a new session

Bind flow state management: use a short-lived server-side token or a signed state parameter in the OIDC redirect that marks it as a "bind" rather than "login". The simplest approach: include `action=bind` in the OAuth `state` parameter (already a random string today). Parse on callback.

---

## Component Boundary Map

```
internal/auth/
  handler.go          [MODIFY] upsertUser, NewHandler (nil-safe oidcClient)
  local.go            [NEW]    RegisterLocal, LoginLocal, BindMicrosoftCallback
  password.go         [NEW]    HashPassword, CheckPassword
  jwt.go              [NO CHANGE]
  middleware.go       [NO CHANGE]
  oidc.go             [NO CHANGE]

cmd/server/main.go    [MODIFY] route registration, authHandler always constructed

migrations/
  022_local_auth_fields.up.sql   [NEW] email_verified, verification_token cols
  022_local_auth_fields.down.sql [NEW] reverse

frontend/src/pages/
  LoginPage.tsx        [MODIFY] add email/password form + providers check
  RegisterPage.tsx     [NEW]    registration form

frontend/src/pages/account/
  AccountPage.tsx      [NEW]    SSO binding UI

frontend/src/App.tsx   [MODIFY] add /register and /account routes
```

---

## Data Flow: Local Registration

```
POST /api/auth/register
  {email, password, name}
        |
        v
  auth.Handler.RegisterLocal
        |
        +-- validate inputs
        +-- check email uniqueness (SELECT)
        +-- bcrypt hash
        +-- INSERT users (email, name, password_hash, email_verified=true)
        +-- INSERT user_site_roles (user_id, role_id=Guest, site_id=NULL)
        +-- JWTService.CreateAccessToken(userID, email)
        +-- JWTService.CreateRefreshToken(userID, email)
        +-- set cookies
        v
  201 {id, email, name}
        |
        v
  Frontend: AuthProvider re-fetches /auth/me, sets user, redirects to /
```

---

## Data Flow: Microsoft SSO Binding

```
GET /api/auth/providers  → {local: true, microsoft: true}
                                    |
                           user already logged in
                                    |
                           GET /account → AccountPage
                                    |
                           "Link Microsoft Account" button
                                    |
                           GET /api/auth/login?action=bind
                           (state encodes action=bind + userID)
                                    |
                           Microsoft OIDC redirect
                                    |
                           GET /api/auth/callback (state decoded)
                                    |
                           action == "bind":
                             UPDATE users SET microsoft_id = $ms_id WHERE id = $userID
                             redirect to /account with success
                           action == "login" (default):
                             upsertUser (existing behavior)
```

---

## Middleware Chain: No Changes Required

The Auth → RBAC → Audit middleware chain is identity-method-agnostic. Local auth, OIDC, and API keys all produce a `*Claims{UserID, Email, TokenType}` context value. The chain operates on `UserID` only.

**RBAC:** No changes. The `user:manage` permission already controls user administration. The new `Guest` role is a DB-level seeding change, not a code change.

**Audit:** No changes. `RegisterLocal` and `LoginLocal` are public (pre-auth) routes, so audit middleware doesn't fire. `BindMicrosoft` is protected — audit can be added as `auditMW.Log("user", "bind_microsoft")` on that route.

---

## Error Handling Integration Points

The current codebase uses `http.Error(w, "message", statusCode)` throughout. For the new auth endpoints, use structured JSON errors consistently:

```go
type APIError struct {
    Error   string `json:"error"`
    Message string `json:"message,omitempty"`
}

func writeError(w http.ResponseWriter, status int, err string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(APIError{Error: err})
}
```

This helper should live in `internal/auth/errors.go` or a shared `internal/httputil/errors.go`. The frontend can then parse `response.json().error` for i18n key mapping.

**Frontend error display pattern:**
- All auth API calls should parse the JSON error body
- Map known error codes to i18n keys (`"email_taken"` → `t('register.errors.emailTaken')`)
- Fall back to a generic error message for unknown codes
- Display inline (below the form field that caused it) for validation errors
- Display as a toast or banner for system errors

---

## Scalability Considerations

| Concern | At current scale | Notes |
|---------|-----------------|-------|
| Password hashing | bcrypt cost=12 adds ~300ms | Acceptable for login; run in goroutine if needed |
| Self-registration spam | No rate limiting today | Add `golang.org/x/time/rate` per-IP limiter on `/api/auth/register` |
| SSO bind security | State token in OAuth flow | Must validate state on callback to prevent CSRF |
| Guest role cleanup | Guests accumulate over time | Admin UI already exists to manage roles; no auto-cleanup needed for v0.0.3 |

---

## Build Order (Dependency-Driven)

**Phase 1: Database foundation**
1. Write migration `022_local_auth_fields` (email_verified, verification_token)
2. Write seed migration for `Guest` role if not present — check existing `009_seed_permissions.up.sql` (Guest is not there; add `022` or a separate `023`)

**Phase 2: Backend — local auth**
3. Add `golang.org/x/crypto` to go.mod if not present
4. Create `internal/auth/password.go` (HashPassword, CheckPassword)
5. Create `internal/auth/local.go` (RegisterLocal, LoginLocal) — no oidcClient dependency
6. Add `GET /api/auth/providers` endpoint (no dependencies)
7. Refactor `NewHandler` in handler.go to accept optional OIDCClient
8. Register new routes in `main.go`

**Phase 3: Backend — SSO binding**
9. Modify `upsertUser` in `handler.go` to handle email→microsoft_id merge
10. Modify `Login` handler to support `action=bind` in OAuth state
11. Add `BindMicrosoftCallback` to `local.go`
12. Register bind route (protected) in `main.go`

**Phase 4: Frontend**
13. Modify `LoginPage.tsx` — check `/api/auth/providers`, add local login form
14. Create `RegisterPage.tsx`
15. Add `/register` route in `App.tsx`
16. Create `AccountPage.tsx` with SSO binding UI
17. Add `/account` route in `App.tsx`
18. Add i18n keys to all 4 locale files

**Phase 5: Error handling**
19. Create `internal/auth/errors.go` (or `internal/httputil`) with JSON error helper
20. Update new auth handlers to use structured errors
21. Update frontend auth calls to parse and display structured errors
22. Review other handlers for consistent error formats (separate pass)

**Phase 6: Validation**
23. Test full registration → login → SSO bind flow
24. Test Microsoft SSO still works (upsert merge logic)
25. Test Guest role assignment and RBAC enforcement
26. End-to-end deploy validation per `docs/deploy.md`

---

## Critical Integration Notes

**`microsoft_id` vs `password_hash` — mutual exclusivity is soft, not enforced**
A user can have both `microsoft_id` and `password_hash` set (after binding). This is intentional — they can log in either way. The `upsertUser` OIDC callback must not overwrite `password_hash` when updating an existing user's microsoft_id.

**Dev mode seed still uses `microsoft_id = 'dev-local'`**
After changes, the dev seed and dev login bypass still work — they're inserting a row with `microsoft_id` set. No changes needed unless you want the dev user to also test local auth. If needed, add a `password_hash` to the dev seed row.

**`/api/auth/me` is registered inside protected `/api` block (with auth middleware) in main.go, not in the public `/api/auth` block**
The `Refresh` and `Logout` endpoints are public (no auth middleware). `RegisterLocal` and `LoginLocal` are also public. The `Me` endpoint is protected. `BindMicrosoftCallback` is protected. This matches existing patterns.

**OIDC client is nil when Azure not configured**
`BindMicrosoftCallback` uses `h.oidc`. Register this route only when `cfg.AzureClientID != ""` — same guard already used for Login/Callback.

---

## Sources

- Direct analysis: `/Users/macmini-au/code/industry-dashboard/internal/auth/` (all files)
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/migrations/002_create_auth.up.sql`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/migrations/003_create_rbac.up.sql`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/migrations/009_seed_permissions.up.sql`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/cmd/server/main.go`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/frontend/src/lib/auth.tsx`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/frontend/src/pages/LoginPage.tsx`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/internal/rbac/middleware.go`
- Direct analysis: `/Users/macmini-au/code/industry-dashboard/internal/audit/middleware.go`
