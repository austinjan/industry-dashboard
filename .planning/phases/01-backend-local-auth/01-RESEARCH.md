# Phase 1: Backend Local Auth - Research

**Researched:** 2026-03-27
**Domain:** Go backend — local email/password authentication alongside existing OIDC/JWT system
**Confidence:** HIGH — based on direct codebase inspection and existing planning research documents

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Registration requires email + password only. Display name derived from email prefix (everything before @). Can be edited later.
- **D-02:** No password complexity requirements — no minimum length, no character mix rules. Just accept whatever the user provides.
- **D-03:** Email clash with existing SSO account: block registration and return a clear error ("email already in use, log in via SSO to link your account"). Safer than dual-account merge; avoids nOAuth.
- **D-04:** No Guest role. Self-registered users get the existing **Viewer** role automatically.
- **D-05:** Viewer role assigned with global scope (site_id = NULL in user_site_roles). Admin can restrict to specific sites later.
- **D-06:** GET /api/auth/providers is dynamic based on config — always includes "local", includes "microsoft" only when Azure env vars are configured.
- **D-07:** On first server startup, if users table is empty, create default admin account: email `admin`, password `default` (bcrypt hashed), Admin role with global scope.
- **D-08:** First-run-only check — if the admin is deleted later, it won't be recreated.

### Claude's Discretion

- Login endpoint design: POST /api/auth/login/local with email + password body, returns same cookie pair as OIDC flow (access_token + refresh_token). Claude decides exact request/response shape.
- Dummy bcrypt on not-found login path to prevent timing-based email enumeration (carried from STATE.md milestone decision).
- New endpoints should use structured {code, message} JSON errors from the start, even though the full error handling sweep is Phase 2.
- Rate limiting implementation details (httprate middleware, limits per endpoint).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | User can register with email and password (Viewer role assigned) | D-01 through D-05 define the full registration contract; `password_hash` column already exists in migration 002; Viewer role already seeded in 009 |
| AUTH-02 | User can login with email and password (JWT issued) | JWTService.CreateAccessToken/CreateRefreshToken are auth-method-agnostic and fully reusable; cookie pattern confirmed in handler.go Callback |
| AUTH-03 | Auth endpoints are rate-limited to prevent brute force | httprate library identified; not yet in go.mod; needs `go get github.com/go-chi/httprate` |
</phase_requirements>

---

## Summary

Phase 1 adds local email/password authentication to a Go backend that already has a complete OIDC/JWT infrastructure. The foundational pieces are already present: `password_hash VARCHAR(255)` exists in the users table (migration 002), `golang.org/x/crypto` is already in go.mod as an indirect dependency (v0.45.0), `JWTService` is auth-method-agnostic, and the cookie-setting pattern is established in `handler.go:Callback`. The RBAC and audit middleware chains require no changes — they operate on `UserID` extracted from the JWT regardless of how it was issued.

The main work is: (1) a new `internal/auth/local.go` file with Register and LoginLocal handlers, (2) a new `internal/auth/password.go` for bcrypt utilities, (3) a `GET /api/auth/providers` endpoint, (4) a first-run admin seed function, (5) rate limiting via httprate (new `go get`), (6) a migration to add `registered_via` column, and (7) refactoring `NewHandler` and route registration in `main.go` so local auth routes are always registered independent of OIDC configuration.

The critical security concern is the dummy bcrypt path on "user not found" to prevent timing-based email enumeration. The existing `authHandler != nil` guard in `main.go` must be broken: local auth works with no Azure config, so the handler must be constructable without an OIDCClient.

**Primary recommendation:** Extend `internal/auth/` with two new files (`local.go`, `password.go`), add one migration (`022_add_registered_via`), promote `golang.org/x/crypto` to direct, add `github.com/go-chi/httprate`, and wire routes in `main.go` to always register local auth endpoints.

---

## Standard Stack

### Core (all already present except httprate)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `golang.org/x/crypto/bcrypt` | v0.45.0 | Password hashing and verification | In go.mod as indirect — promote to direct |
| `github.com/golang-jwt/jwt/v5` | v5.3.1 | JWT issuance (existing JWTService — no changes needed) | Direct dep, already used |
| `github.com/jackc/pgx/v5` | v5.7.2 | DB queries for user insert and lookup | Direct dep, already used |
| `github.com/go-chi/chi/v5` | v5.2.1 | Router and middleware chaining | Direct dep, already used |

### New Dependency

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `github.com/go-chi/httprate` | v0.15.0 | Per-IP sliding-window rate limiting on auth endpoints | Same chi ecosystem; zero-config per-IP limiter; in-memory is correct for single-instance deployment |

**Installation:**
```bash
go get github.com/go-chi/httprate
```

**Promote existing indirect to direct (no install needed):**
```bash
go get golang.org/x/crypto
```

### Version verification (confirmed 2026-03-27)

- `golang.org/x/crypto`: v0.45.0 in go.mod — already present
- `github.com/go-chi/httprate`: v0.15.0 (released 2025-03-29) — not yet in go.mod, needs `go get`
- `github.com/stretchr/testify`: v1.10.0 — already in go.mod (used for existing tests in `internal/auth/`)

### Alternatives Not Chosen

| Instead of | Could Use | Why Standard is Preferred |
|------------|-----------|--------------------------|
| httprate | `golang.org/x/time/rate` with sync.Map | httprate is purpose-built for chi, handles cleanup and per-IP tracking automatically |
| bcrypt | argon2id | bcrypt is already in the module tree, sufficient for this use case, OWASP minimum at cost 10+ |
| Custom error helper | `go-chi/render` | chi/render adds content negotiation overhead not needed for JSON-only API |

---

## Architecture Patterns

### Files to Create / Modify

```
internal/auth/
  local.go          [NEW]    RegisterLocal, LoginLocal handlers
  password.go       [NEW]    HashPassword, CheckPassword, dummyHash
  handler.go        [MODIFY] NewHandler accepts nil OIDCClient; add Providers handler; add seedDefaultAdmin
  jwt.go            [NO CHANGE]
  middleware.go     [NO CHANGE]
  oidc.go           [NO CHANGE]

cmd/server/main.go  [MODIFY] always construct authHandler; separate local vs SSO route registration

migrations/
  022_add_registered_via.up.sql   [NEW]
  022_add_registered_via.down.sql [NEW]
```

### Pattern 1: Handler Always Constructable (no OIDC required)

The current `NewHandler(oidc *OIDCClient, jwt *JWTService, db *pgxpool.Pool)` is only called when Azure is configured. Local auth needs the handler always. Refactor so `oidcClient` is optional (nil-safe):

```go
// internal/auth/handler.go
func NewHandler(oidc *OIDCClient, jwt *JWTService, db *pgxpool.Pool) *Handler {
    return &Handler{oidc: oidc, jwt: jwt, db: db}
}
// Handler methods that use h.oidc must guard: if h.oidc == nil { return 501 }
```

In `cmd/server/main.go`, always construct the handler:

```go
// Always constructed — local auth works without OIDC
authHandler := auth.NewHandler(nil, jwtService, pool)

if cfg.AzureClientID != "" {
    oidcClient, err := auth.NewOIDCClient(...)
    if err != nil {
        log.Printf("Warning: OIDC client setup failed: %v", err)
    } else {
        authHandler = auth.NewHandler(oidcClient, jwtService, pool)
    }
}
```

### Pattern 2: Route Registration Split (local always / SSO conditional)

```go
// Public auth routes — always registered
r.Route("/api/auth", func(r chi.Router) {
    // Local auth — always available
    r.With(httprate.LimitByIP(5, time.Minute)).Post("/login/local", authHandler.LoginLocal)
    r.With(httprate.LimitByIP(3, time.Hour)).Post("/register", authHandler.RegisterLocal)
    r.Get("/providers", authHandler.Providers)
    // Shared
    r.Post("/refresh", authHandler.Refresh)
    r.Post("/logout", authHandler.Logout)
})

// SSO routes — only when Azure configured
if cfg.AzureClientID != "" {
    r.Get("/api/auth/login", authHandler.Login)
    r.Get("/api/auth/callback", authHandler.Callback)
}

// Protected: /api/auth/me — inside the protected /api block (existing pattern)
// already registered as: r.Get("/auth/me", authHandler.Me)
// NEW: always register it, not just when authHandler != nil
```

**Note:** The existing dev-mode fallback for `/api/auth/me` (lines 303-360 in main.go) is no longer needed once `authHandler` is always constructed.

### Pattern 3: Password Utilities (`internal/auth/password.go`)

```go
package auth

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

// Pre-computed at package init for timing-safe not-found path
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-sentinel"), bcryptCost)

func HashPassword(plain string) (string, error) {
    b, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
    return string(b), err
}

func CheckPassword(hash, plain string) bool {
    return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// UsedForTimingOnly — call when user not found to normalize response time
func DummyCheckPassword(plain string) {
    bcrypt.CompareHashAndPassword(dummyHash, []byte(plain))
}
```

**Why cost 12:** OWASP recommends minimum cost 10; cost 12 provides ~300ms on modern hardware and is the common recommendation for new deployments as of 2025/2026.

**Why dummyHash at package init:** Generating a fresh dummy hash per request adds unnecessary startup jitter. Computing once at init normalizes the timing profile across all not-found paths.

**bcrypt 72-byte limit:** bcrypt silently truncates passwords longer than 72 bytes. Since D-02 imposes no password length limit, enforce a max of 72 characters (not just bytes) in RegisterLocal to prevent silent truncation.

### Pattern 4: RegisterLocal Handler

```go
// POST /api/auth/register
// Body: {email, password}
func (h *Handler) RegisterLocal(w http.ResponseWriter, r *http.Request) {
    var req struct {
        Email    string `json:"email"`
        Password string `json:"password"`
    }
    // 1. Decode body
    // 2. Validate: email format, len(password) <= 72
    // 3. Derive display name from email prefix (before @)
    // 4. Check email uniqueness — if taken, return structured error:
    //    {code: "auth.email_taken", message: "..."}
    //    If existing row has microsoft_id set: guide user to SSO login
    // 5. bcrypt hash password (cost 12)
    // 6. INSERT users (email, name, password_hash, registered_via='local')
    // 7. Get Viewer role ID: SELECT id FROM roles WHERE name='Viewer'
    // 8. INSERT user_site_roles (user_id, role_id, site_id=NULL)
    // 9. CreateAccessToken + CreateRefreshToken
    // 10. Set cookies (same MaxAge pattern as Callback)
    // 11. 201 JSON {id, email, name}
}
```

### Pattern 5: LoginLocal Handler (with timing-safe not-found path)

```go
// POST /api/auth/login/local
// Body: {email, password}
func (h *Handler) LoginLocal(w http.ResponseWriter, r *http.Request) {
    // 1. Decode body
    // 2. SELECT id, email, name, password_hash, is_active FROM users WHERE email=$1
    // 3. If not found: DummyCheckPassword(password); return 401 {code: "auth.invalid_credentials"}
    // 4. If password_hash IS NULL: user is SSO-only; return 401 {code: "auth.invalid_credentials"}
    //    NOTE: Do not reveal that account exists or is SSO-only — same generic code
    // 5. CheckPassword(hash, password) — if false: return 401 {code: "auth.invalid_credentials"}
    // 6. If !is_active: return 403 {code: "auth.account_disabled"}
    // 7. CreateAccessToken + CreateRefreshToken
    // 8. Set cookies
    // 9. 200 JSON {id, email, name}
}
```

### Pattern 6: Providers Endpoint

```go
// GET /api/auth/providers — always public, no auth required
func (h *Handler) Providers(w http.ResponseWriter, r *http.Request) {
    providers := []string{"local"}
    if h.oidc != nil {
        providers = append(providers, "microsoft")
    }
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]interface{}{
        "providers": providers,
    })
}
```

### Pattern 7: Default Admin Seed (first-run only)

```go
// Called in main.go after pool is connected, before router setup
func seedDefaultAdmin(ctx context.Context, pool *pgxpool.Pool, jwtService *auth.JWTService) {
    var count int
    pool.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
    if count > 0 {
        return // not first run
    }
    hash, _ := auth.HashPassword("default")
    var adminID string
    pool.QueryRow(ctx,
        `INSERT INTO users (email, name, password_hash, registered_via, is_active)
         VALUES ('admin', 'Administrator', $1, 'local', true)
         RETURNING id`, hash).Scan(&adminID)
    var adminRoleID string
    pool.QueryRow(ctx, `SELECT id FROM roles WHERE name='Admin'`).Scan(&adminRoleID)
    pool.Exec(ctx,
        `INSERT INTO user_site_roles (user_id, role_id, site_id)
         VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING`, adminID, adminRoleID)
    log.Println("Default admin created (email: admin, password: default) — CHANGE IMMEDIATELY")
}
```

**Note on D-07 email `admin`:** The value `admin` is not a valid email address (no @ sign). The users table has `email VARCHAR(255) NOT NULL UNIQUE`. This will work at the DB level (VARCHAR allows it), but if any validation in RegisterLocal enforces email format, the seed bypasses it (seed uses direct SQL). This is intentional: the admin account is a first-run bootstrap, not a self-registered user. The planner should note that LoginLocal must accept this non-RFC-5322 email (simple string match, not email-format validation).

### Pattern 8: Structured Error Helper (new endpoints only — full sweep is Phase 2)

New endpoints use structured errors. Minimal helper in `internal/auth/errors.go`:

```go
package auth

import (
    "encoding/json"
    "net/http"
)

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

**Error codes for this phase:**

| Code | HTTP Status | Trigger |
|------|-------------|---------|
| `auth.invalid_credentials` | 401 | Wrong password, user not found, or SSO-only account |
| `auth.email_taken` | 409 | Email already registered (local or SSO) |
| `auth.account_disabled` | 403 | `is_active = false` |
| `rate_limit.exceeded` | 429 | httprate returns this automatically |
| `internal` | 500 | Unexpected DB error (log detail, send static message) |

### Pattern 9: Migration 022

```sql
-- 022_add_registered_via.up.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_via VARCHAR(20) NOT NULL DEFAULT 'microsoft';
```

```sql
-- 022_add_registered_via.down.sql
ALTER TABLE users DROP COLUMN IF EXISTS registered_via;
```

Existing rows (all SSO) default to `'microsoft'`. New local registrations set `'local'`. New admin seed sets `'local'`.

### Anti-Patterns to Avoid

- **Registering local auth routes inside the `if authHandler != nil` block:** Local auth must work with no Azure config. The guard must be removed for local routes.
- **Returning 404 for "user not found" on login:** Always return 401 with `auth.invalid_credentials` — never reveal whether the email exists.
- **Skipping DummyCheckPassword on not-found path:** The fast path creates a timing oracle. Always call it.
- **Using bcrypt cost 10 or lower:** OWASP minimum is 10; use 12 for new deployments.
- **Inserting password_hash without length check:** bcrypt silently truncates at 72 bytes — enforce max 72 chars before hashing.
- **Making seedDefaultAdmin re-entrant without the count check:** Must only fire when users table is truly empty.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-IP rate limiting | Custom sync.Map + goroutine cleanup | `github.com/go-chi/httprate` | Sliding window, automatic cleanup, chi-native, one middleware line |
| Password hashing | Custom crypto | `golang.org/x/crypto/bcrypt` | Already in module; handles salt, cost, format; OWASP standard |
| JWT issuance | New token logic | Existing `JWTService.CreateAccessToken/CreateRefreshToken` | Already works; same output consumed by all downstream middleware |
| Cookie setting | Custom cookie logic | Copy the pattern from `handler.go:Callback` | Exact cookie names/paths/MaxAge are already established and tested |

---

## Runtime State Inventory

This is a greenfield phase (new endpoints, no renames/refactors). No runtime state inventory needed.

Step 2.5: SKIPPED (not a rename/refactor/migration phase).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go runtime | Build + test | Yes | 1.26.1 | — |
| `golang.org/x/crypto` | bcrypt hashing | Yes (indirect in go.mod) | v0.45.0 | — |
| `github.com/go-chi/httprate` | Rate limiting | No (not in go.mod) | v0.15.0 target | None — must `go get` |
| `github.com/stretchr/testify` | Unit tests | Yes | v1.10.0 | — |
| TimescaleDB (Docker) | Integration tests only | Assumed available (existing dev setup) | — | Skip integration tests, unit-test handlers with mocks |

**Missing dependencies with no fallback:**
- `github.com/go-chi/httprate` — must be added before implementing rate limiting. Install: `go get github.com/go-chi/httprate`.

---

## Common Pitfalls

### Pitfall 1: Timing Attack — Email Enumeration via Response Time

**What goes wrong:** Login returns fast when user not found, slow (~300ms) when bcrypt runs. Attacker measures response time to enumerate valid emails.

**Why it happens:** Natural code flow returns early on not-found.

**How to avoid:** Always call `DummyCheckPassword(plain)` before returning 401 on not-found path. Never return 404 for missing user — always 401.

**Warning signs:** Benchmark `/api/auth/login/local` with valid vs invalid email; response time difference > 50ms indicates the dummy path is missing.

### Pitfall 2: local auth routes gated behind `authHandler != nil`

**What goes wrong:** If local routes are registered inside the existing OIDC guard, they don't work in deployments without Azure config — which is the primary dev/local use case.

**How to avoid:** Construct `authHandler` unconditionally in main.go. Only SSO routes (GET /login, GET /callback) go inside the Azure guard.

### Pitfall 3: `/api/auth/me` Not Registered When OIDC Not Configured

**What goes wrong:** The existing protected route `r.Get("/auth/me", authHandler.Me)` is inside `if authHandler != nil`. After refactor, `authHandler` is always non-nil, but the planner must ensure the route registration follows suit — remove the guard for Me as well.

**How to avoid:** After making `authHandler` always constructable, remove the `authHandler != nil` guard from the protected `/api/auth/me` route. The dev-mode fallback Me handler (lines 303-330 in main.go) becomes dead code and should be removed.

### Pitfall 4: Viewer Role ID Hardcoded

**What goes wrong:** Using a hardcoded role name lookup each time a user registers is a DB round-trip but safe. Do NOT hardcode the UUID.

**How to avoid:** `SELECT id FROM roles WHERE name='Viewer'` at registration time. If Viewer role not found, return 500 — it's a misconfigured system, not a user error.

### Pitfall 5: `admin` Username Is Not a Valid Email

**What goes wrong:** If RegisterLocal enforces RFC-5322 email format, the email validation pattern also runs in LoginLocal — and `admin` (no @ sign) would be rejected by client-side or server-side validation before it even reaches the DB lookup.

**How to avoid:** LoginLocal must not reject the `admin` value as invalid before querying the DB. Simple approach: apply email format validation only in RegisterLocal (where it protects against junk input); LoginLocal accepts any non-empty string as the email field and looks it up as-is.

### Pitfall 6: Double-Registration of `/api/auth` Route in main.go

**What goes wrong:** The current code has two separate `/api/auth` route registrations: one public block (the OIDC guard) and one inside the dev-mode block. After refactoring to always register local auth, chi will panic on duplicate route group registration.

**How to avoid:** Consolidate all `/api/auth` public routes into a single `r.Route("/api/auth", ...)` block. Remove the dev-mode `/api/auth` fallback block (it becomes dead code once `authHandler` is always available).

---

## Code Examples

### bcrypt usage (verified pattern)

```go
// Source: golang.org/x/crypto/bcrypt pkg.go.dev (official)

// Registration — hash
hash, err := bcrypt.GenerateFromPassword([]byte(plainPassword), 12)
if err != nil { /* handle */ }
storedHash := string(hash)

// Login — verify
err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(candidatePassword))
if err == nil { /* match */ }
```

### httprate usage (verified pattern from go-chi/httprate GitHub)

```go
// Source: https://github.com/go-chi/httprate
import "github.com/go-chi/httprate"

r.With(httprate.LimitByIP(5, time.Minute)).Post("/api/auth/login/local", h.LoginLocal)
r.With(httprate.LimitByIP(3, time.Hour)).Post("/api/auth/register", h.RegisterLocal)
```

httprate returns HTTP 429 with a plain text body when limit exceeded. The `Too Many Requests` response is produced automatically — no handler code needed.

### Cookie pattern (from existing `handler.go:Callback` — authoritative)

```go
// access_token: 15 minutes, all paths
http.SetCookie(w, &http.Cookie{
    Name:     "access_token",
    Value:    accessToken,
    Path:     "/",
    HttpOnly: true,
    SameSite: http.SameSiteLaxMode,
    MaxAge:   900,
})
// refresh_token: 7 days, scoped to /api/auth
http.SetCookie(w, &http.Cookie{
    Name:     "refresh_token",
    Value:    refreshToken,
    Path:     "/api/auth",
    HttpOnly: true,
    SameSite: http.SameSiteLaxMode,
    MaxAge:   604800,
})
```

### Dummy hash pattern (timing-safe not-found)

```go
// Source: derived from OWASP Password Storage Cheat Sheet + PITFALLS.md Pitfall 3
// Computed once at package init — never regenerate per request
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("dummy-sentinel"), bcryptCost)

// In LoginLocal, user-not-found path:
user, err := getUser(ctx, email)
if err != nil {
    bcrypt.CompareHashAndPassword(dummyHash, []byte(password)) // discard result
    writeError(w, http.StatusUnauthorized, "auth.invalid_credentials", "Invalid email or password")
    return
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact for this Phase |
|--------------|------------------|----------------------|
| SSO-only auth | Local + SSO side-by-side | Handler must be nil-safe for OIDCClient |
| `authHandler != nil` guards all routes | Always-on local auth, conditional SSO | Route registration must be restructured |
| Dev-mode Me/refresh/logout fallback | Real handlers always available | Dev-mode fallback becomes dead code, should be removed |

---

## Open Questions

1. **bcrypt cost 12 vs 10 (PITFALLS.md recommends 12; STACK.md recommends DefaultCost=10)**
   - What we know: OWASP minimum is 10; cost 12 is ~300ms on modern hardware; STACK.md from earlier research uses DefaultCost (10); PITFALLS.md recommends 12
   - What's unclear: Which to use for this project
   - Recommendation: Use cost 12. The 300ms per login is acceptable for an industrial dashboard with human users. Security margin is worth the latency.

2. **`admin` as email value — LoginLocal validation scope**
   - What we know: D-07 specifies email=`admin` for the default admin account; this is not a valid RFC-5322 email
   - What's unclear: Whether LoginLocal should validate email format before querying
   - Recommendation: LoginLocal skips email format validation (just checks non-empty). RegisterLocal applies format validation to prevent junk self-registrations. The admin account bypasses registration entirely (direct SQL seed), so format validation in RegisterLocal doesn't affect it.

3. **Rate limit values: 5/min for login vs the Success Criteria which says "more than 5 attempts per minute rejected with 429"**
   - What we know: Success criterion says >5 attempts/minute rejected (i.e., 6th attempt gets 429); httprate's `LimitByIP(5, time.Minute)` allows exactly 5, rejects the 6th
   - Recommendation: `httprate.LimitByIP(5, time.Minute)` satisfies the criterion. For registration, use `httprate.LimitByIP(3, time.Hour)` as suggested in PITFALLS.md.

---

## Validation Architecture

No `.planning/config.json` found — treating nyquist_validation as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Go testing + testify v1.10.0 |
| Config file | none (standard `go test ./...`) |
| Quick run command | `go test ./internal/auth/... -v` |
| Full suite command | `make test` (runs `go test ./...`) |

Existing tests in `internal/auth/`: `jwt_test.go` (5 tests), `middleware_test.go` (5 tests). All pass (`ok internal/auth 0.429s`). New tests must use `package auth_test` to follow the established external test pattern.

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | RegisterLocal inserts user, assigns Viewer role, returns JWT cookies | unit (httptest) | `go test ./internal/auth/... -run TestRegisterLocal -v` | No — Wave 0 |
| AUTH-01 | Register with existing email returns 409 auth.email_taken | unit (httptest) | `go test ./internal/auth/... -run TestRegisterLocalEmailTaken -v` | No — Wave 0 |
| AUTH-01 | Register with SSO-existing email returns 409 with SSO guidance | unit (httptest) | `go test ./internal/auth/... -run TestRegisterLocalSSORejected -v` | No — Wave 0 |
| AUTH-02 | LoginLocal with correct credentials returns JWT cookies | unit (httptest) | `go test ./internal/auth/... -run TestLoginLocal -v` | No — Wave 0 |
| AUTH-02 | LoginLocal with wrong password returns 401 | unit (httptest) | `go test ./internal/auth/... -run TestLoginLocalWrongPassword -v` | No — Wave 0 |
| AUTH-02 | LoginLocal with unknown email returns 401 (not 404) | unit (httptest) | `go test ./internal/auth/... -run TestLoginLocalUnknownEmail -v` | No — Wave 0 |
| AUTH-02 | LoginLocal timing: valid vs invalid email response time difference < 50ms | unit (timing) | `go test ./internal/auth/... -run TestLoginLocalTiming -v` | No — Wave 0 |
| AUTH-02 | GET /api/auth/providers returns ["local"] without Azure config | unit (httptest) | `go test ./internal/auth/... -run TestProviders -v` | No — Wave 0 |
| AUTH-03 | 6th login attempt in 1 minute returns 429 | unit (httptest) | `go test ./internal/auth/... -run TestRateLimit -v` | No — Wave 0 |

**Note on unit test approach:** The existing tests in `internal/auth/` test JWT and middleware in isolation (no DB). For RegisterLocal and LoginLocal, tests need a DB connection or a mock. The established pattern in this codebase (based on file inventory) does not use DB mocks — integration tests against a real DB are used elsewhere. For this phase, tests that require DB (RegisterLocal, LoginLocal) can be implemented as integration tests requiring TimescaleDB, or as handler tests with a mock store pattern. The planner should decide whether to add a store interface for testability or run against a test DB.

### Sampling Rate

- **Per task commit:** `go test ./internal/auth/... -v`
- **Per wave merge:** `make test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `internal/auth/local_test.go` — covers AUTH-01 (RegisterLocal variants), AUTH-02 (LoginLocal variants, timing), AUTH-03 (rate limit)
- [ ] `internal/auth/providers_test.go` — covers AUTH-02 providers endpoint (or include in local_test.go)

Framework and testify are already installed — no new test infrastructure needed.

---

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives apply to this phase:

| Directive | Impact on Phase 1 |
|-----------|-------------------|
| When any backend API endpoint is created/updated/deleted, always check `cmd/dashboard-cli/` and update CLI | Phase 1 adds 3 new public endpoints. Check if dashboard-cli exposes auth endpoints; if so, update the CLI. |
| Tech stack: Go (chi router, pgx for Postgres) | Confirmed — no deviation. Use chi middleware, pgx pool queries. |
| Auth: Microsoft Entra ID via OIDC, JWT sessions | Phase 1 adds local auth alongside — does not replace OIDC. JWT shape unchanged. |
| RBAC: Custom roles with permission sets, scoped per site | Viewer role assigned with site_id=NULL per D-05. Existing RBAC middleware unchanged. |
| i18n: Supports 4 languages | Phase 1 is backend-only. No frontend strings added in this phase. No i18n action required. |
| Build: `make test` runs all Go tests | Phase gate: `make test` must pass before /gsd:verify-work. |

**Dashboard-CLI check required:** After adding endpoints, verify `/Users/macmini-au/code/industry-dashboard/cmd/dashboard-cli/` for any auth-related commands that need updating. The three new endpoints (`POST /api/auth/register`, `POST /api/auth/login/local`, `GET /api/auth/providers`) are public auth flows unlikely to be in an LLM-facing CLI, but the check is mandatory per CLAUDE.md.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: `internal/auth/handler.go`, `jwt.go`, `middleware.go` — JWT, cookie, upsertUser patterns
- Direct codebase analysis: `migrations/002_create_auth.up.sql` — confirmed `password_hash` column exists
- Direct codebase analysis: `migrations/009_seed_permissions.up.sql` — confirmed Viewer role exists; no Guest role exists
- Direct codebase analysis: `cmd/server/main.go` — route registration, authHandler nil-guard, dev-mode structure
- Direct codebase analysis: `go.mod` — confirmed `golang.org/x/crypto v0.45.0` indirect; `httprate` absent
- Direct codebase analysis: `internal/auth/jwt_test.go`, `middleware_test.go` — test framework pattern (testify external test package)
- `.planning/research/STACK.md` — bcrypt usage pattern, httprate version, error shape convention
- `.planning/research/PITFALLS.md` — timing attack dummy hash pattern, rate limiting limits, SSO collision handling
- `.planning/research/ARCHITECTURE.md` — component boundary map, route registration pattern, data flow diagrams

### Secondary (MEDIUM confidence)

- [go-chi/httprate GitHub](https://github.com/go-chi/httprate) — v0.15.0 confirmed, LimitByIP API
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — bcrypt cost recommendations

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries either already in go.mod (verified) or verified against official sources
- Architecture: HIGH — based on direct codebase inspection of all relevant files
- Pitfalls: HIGH — sourced from project-specific PITFALLS.md plus codebase inspection; not hypothetical
- Test infrastructure: HIGH — existing tests confirmed passing, framework identified

**Research date:** 2026-03-27
**Valid until:** 2026-05-27 (stable Go ecosystem; chi and bcrypt APIs are stable)
