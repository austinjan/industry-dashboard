# Technology Stack — v0.0.3 Additions

**Project:** Industry Dashboard — Local Auth, SSO Binding, Error Handling
**Researched:** 2026-03-27
**Scope:** NEW capabilities only. Existing stack (chi, pgx, JWT, OIDC, React 18, TanStack Query, shadcn/ui) is not repeated here.

---

## What This Milestone Needs

Four distinct problems, each with a specific solution:

1. **Password hashing** — store and verify email/password credentials securely
2. **Rate limiting** — protect `/api/auth/register` and `/api/auth/login` from abuse
3. **SSO binding** — link a Microsoft-authenticated account to a local account by email
4. **Structured error responses** — consistent JSON error shape across all handlers

---

## Backend Additions

### 1. Password Hashing — `golang.org/x/crypto/bcrypt`

| Property | Value |
|----------|-------|
| Package | `golang.org/x/crypto/bcrypt` |
| Module | `golang.org/x/crypto` |
| Current version in go.mod | `v0.45.0` (already present as `indirect`) |
| Status | **Promote to direct — no new dependency needed** |

**Why bcrypt:** Standard Go ecosystem choice. Already vendored transitively (via go-oidc). The `password_hash VARCHAR(255)` column already exists in the `users` table (migration 002). No schema change needed for basic local auth.

**Usage pattern:**
```go
// Hash on registration
hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)

// Verify on login
err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(candidatePassword))
```

**Cost:** Use `bcrypt.DefaultCost` (10). OWASP minimum is 10; DefaultCost is exactly that. Do not lower it for "performance" — the deliberate slowness is the security property.

**Constraint:** bcrypt silently truncates passwords longer than 72 bytes. Enforce a max length of 72 characters in the registration handler (not just in the frontend) to prevent silent truncation surprises.

**Why NOT argon2id:** Argon2id is theoretically stronger, but bcrypt is the dominant choice for Go web apps, already in the module tree, and more than sufficient for this use case. Adding argon2id introduces no material security improvement for an industrial dashboard where bcrypt at cost 10 is the floor. Keep it simple.

---

### 2. Rate Limiting — `github.com/go-chi/httprate`

| Property | Value |
|----------|-------|
| Package | `github.com/go-chi/httprate` |
| Current version | `v0.15.0` (released 2025-03-29) |
| Install | `go get github.com/go-chi/httprate` |

**Why httprate:** Same chi ecosystem. Sliding window counter, per-IP by default, zero configuration for the common case. A single middleware line protects the route.

**Usage — apply only to auth mutation endpoints:**
```go
r.With(httprate.LimitByIP(10, time.Minute)).Post("/api/auth/register", ...)
r.With(httprate.LimitByIP(20, time.Minute)).Post("/api/auth/login", ...)
```

Registration gets a stricter limit (10/min/IP) than login (20/min/IP) because registration creates database rows.

**Why NOT `golang.org/x/time/rate` directly:** That's a token bucket you'd wire up yourself with a sync.Map and a cleanup goroutine. httprate implements the same concept with sliding windows, per-IP tracking, and automatic cleanup — and it's already purpose-built for chi. Use the right tool.

**Why NOT Redis-backed limiter:** Single-instance deployment (embedded binary + single Postgres). In-memory is correct. If the deployment model changes to multi-instance, replace the LimitCounter backend — the API is the same.

---

### 3. SSO Account Binding (no new library)

Microsoft SSO binding to a local account works by matching on `email`. The strategy:

1. During OIDC callback, check if a user with `email = oidcUser.Email` already exists (regardless of `microsoft_id`).
2. If found and `microsoft_id IS NULL`, update `microsoft_id` to link the accounts.
3. If found and `microsoft_id` already set to a different value, reject with a clear error.
4. If not found, create a new user (existing behavior).

This is pure SQL logic change in `upsertUser()` — no new library needed.

**Migration needed:** The current upsert uses `ON CONFLICT (microsoft_id)`, which doesn't handle the case where a local user exists with the same email. The new upsert must first look up by email, then decide whether to insert or update. Write this as a two-step query (SELECT then INSERT/UPDATE) wrapped in a transaction, not a single ON CONFLICT clause.

**New migration (022) needed:** Add a `registered_via` column to `users` to distinguish how an account was originally created (`'local'` | `'microsoft'`). This drives UI decisions (e.g., showing "Change password" only for local accounts, showing "Link Microsoft account" only for unlinked local accounts).

```sql
ALTER TABLE users ADD COLUMN registered_via VARCHAR(20) NOT NULL DEFAULT 'microsoft';
```

Existing rows default to `'microsoft'`. New local registrations set `'local'`.

---

### 4. Structured Error Responses (no new library)

The existing codebase uses `http.Error(w, "message", status)` — plain text, inconsistent. Every handler does this differently.

**Introduce a small internal helper (no external dependency):**

```go
// internal/httputil/respond.go
package httputil

type ErrorResponse struct {
    Code    string `json:"code"`
    Message string `json:"message"`
}

func WriteError(w http.ResponseWriter, status int, code, message string) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(ErrorResponse{Code: code, Message: message})
}

func WriteJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(v)
}
```

**Error code convention — machine-readable strings, not numbers:**

| Code | Meaning |
|------|---------|
| `auth.invalid_credentials` | Wrong email or password (never distinguish which) |
| `auth.email_taken` | Registration with existing email |
| `auth.weak_password` | Password too short |
| `auth.sso_conflict` | SSO email already bound to a different account |
| `auth.account_disabled` | `is_active = false` |
| `rate_limit.exceeded` | Too many requests |
| `rbac.forbidden` | Authenticated but insufficient permissions |
| `not_found` | Resource not found |
| `validation.failed` | Request body validation error |
| `internal` | Unexpected server error (log detail server-side, don't expose) |

**Frontend consumption:** The existing `apiFetch` wrapper already handles 401 with token refresh. Extend auth.tsx and the API layer to read `response.json().code` and map codes to i18n translation keys. This avoids hardcoding English error strings in API responses while still giving the frontend machine-readable signal.

**Why NOT RFC 7807 Problem Details:** RFC 7807 is correct for public APIs or inter-service communication. For a self-contained SPA + backend, a simpler `{code, message}` shape is easier to consume in the frontend without a spec dependency. The `code` field provides the same discriminability.

**Why NOT chi/render package:** `chi/render` adds content negotiation and a renderer interface that's useful when returning multiple content types. This backend serves only JSON — the helper above is 15 lines and covers every case.

---

## Frontend Additions

No new npm packages needed. The existing stack covers everything:

| Capability | Existing package | Notes |
|------------|-----------------|-------|
| Login form | `react-hook-form` v7 + `zod` v4 + `@hookform/resolvers` | All three already in package.json |
| Registration form | Same as above | Add email + password + confirm-password schema |
| Form inputs | `shadcn/ui` Input, Label, Button, Form components | Already available in `src/components/ui/` |
| Error display | `shadcn/ui` + i18n | Map `error.code` to `t('errors.<code>')` |
| Loading states | TanStack Query `useMutation` | Already used throughout |
| Routing (login redirect) | `react-router-dom` v7 | Already present |

**New translation keys required (all 4 locale files):**

```json
{
  "auth": {
    "registerTitle": "...",
    "emailLabel": "...",
    "passwordLabel": "...",
    "confirmPasswordLabel": "...",
    "registerButton": "...",
    "loginButton": "...",
    "alreadyHaveAccount": "...",
    "dontHaveAccount": "...",
    "linkMicrosoft": "...",
    "unlinkMicrosoft": "...",
    "microsoftLinked": "..."
  },
  "errors": {
    "auth.invalid_credentials": "...",
    "auth.email_taken": "...",
    "auth.weak_password": "...",
    "auth.sso_conflict": "...",
    "auth.account_disabled": "...",
    "rate_limit.exceeded": "...",
    "rbac.forbidden": "...",
    "not_found": "...",
    "validation.failed": "...",
    "internal": "..."
  }
}
```

---

## Database Changes

| Migration | Change | Why |
|-----------|--------|-----|
| 022_add_registered_via | `ALTER TABLE users ADD COLUMN registered_via VARCHAR(20) NOT NULL DEFAULT 'microsoft'` | Distinguish local vs SSO account creation for UI decisions |

The `password_hash` column already exists (migration 002). No migration needed for basic local auth.

Guest role for self-registration: Check migration 003 / seed — if a `guest` role does not exist in the roles seed, add a seed migration to insert it. The RBAC system is already in place; registration just needs to know which role ID to assign.

---

## What to NOT Add

| Temptation | Why to skip it |
|------------|---------------|
| Email verification on registration | Adds SMTP dependency. Industrial dashboard users are added by admins. Self-registration as guest is low-risk; skip verification for v0.0.3. |
| Password reset flow | Requires email sending. Out of scope for this milestone. |
| OAuth2 state for SSO binding flow | SSO binding happens automatically by email match in the callback — no separate flow needed. |
| External rate limiter (Redis, Memcached) | Single-instance deployment. In-memory is correct. |
| argon2id or scrypt | bcrypt is sufficient and already in the module. |
| `chi/render` or `go-chi/responder` | 15-line internal helper covers all cases. |
| `ozzo-validation` or similar | Inline validation in handlers is clear enough. Registration has 2–3 fields. |
| Separate `users/local` vs `users/sso` tables | One `users` table with nullable `microsoft_id` and `registered_via` is the right model for account linking. Splitting tables makes binding queries complex. |

---

## Integration Points with Existing Code

| New code | Integrates with | How |
|----------|-----------------|-----|
| `bcrypt.GenerateFromPassword` | `internal/auth/handler.go` — new `Register` and `LocalLogin` handlers | Same handler file, same `Handler` struct, same JWT issuance path |
| `httprate.LimitByIP` | `cmd/server/main.go` route registration | Apply as chi middleware on `/api/auth/register` and `/api/auth/login` only |
| `httputil.WriteError` | All existing handlers | Gradual replacement of `http.Error(w, ...)` calls; new handlers use it from day one |
| `registered_via` column | `upsertUser()` and new `RegisterUser()` function | Set on INSERT; read in `GET /api/auth/me` response so frontend knows which auth flows to show |
| SSO binding logic | `Callback()` in `handler.go` | Replace single-step upsert with: SELECT by email → conditional INSERT or UPDATE |
| Error codes in frontend | `src/lib/api.ts` and component-level error display | Parse JSON body on non-2xx responses; map `code` to translation key |

---

## Sources

- [golang.org/x/crypto/bcrypt — pkg.go.dev](https://pkg.go.dev/golang.org/x/crypto/bcrypt) — HIGH confidence (official)
- [go-chi/httprate v0.15.0 — GitHub](https://github.com/go-chi/httprate) — HIGH confidence (official repo, verified current version)
- [OWASP Password Storage Cheat Sheet — bcrypt cost](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) — HIGH confidence (official security standard)
- [react-hook-form/resolvers — GitHub](https://github.com/react-hook-form/resolvers) — HIGH confidence (official)
- Existing codebase inspection: `go.mod`, `migrations/002_create_auth.up.sql`, `internal/auth/handler.go`, `internal/auth/jwt.go`, `frontend/package.json` — HIGH confidence (authoritative, primary source)
