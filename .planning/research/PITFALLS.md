# Domain Pitfalls

**Domain:** Adding local authentication alongside existing SSO, self-registration, SSO account binding, and error handling improvements to Go + React industrial dashboard
**Researched:** 2026-03-27
**Codebase version:** v0.0.2 (SSO-only auth, JWT cookies, existing RBAC middleware)

---

## Critical Pitfalls

Mistakes that cause security vulnerabilities, account takeovers, or fundamental rewrites.

---

### Pitfall 1: Auto-Linking SSO to Local Account by Email Match Alone (nOAuth/Account Takeover)

**What goes wrong:** When a user logs in via Microsoft SSO, the system sees their email and automatically merges with (or creates) a local account that has that email. An attacker creates an Azure AD account, changes its email to a victim's email address, then logs in via SSO — the system merges them into the victim's account.

**Why it happens:** The `upsertUser` in `internal/auth/handler.go` currently keys on `microsoft_id` (correct for SSO-only). If a developer adds local auth and then writes a "link by email" path for convenience, the safety breaks immediately.

**Consequences:** Full account takeover bypassing MFA, conditional access, and zero-trust policies. This is the documented nOAuth vulnerability affecting Microsoft Entra ID applications.

**Prevention:**
- Never automatically link a local account to an SSO identity based on email match alone without explicit user proof of ownership (entering the local password or completing an email verification challenge).
- The schema already has `password_hash` and `microsoft_id` as separate nullable columns — keep them separate. A user logging in via SSO should NOT automatically gain access to a local account at the same email without authentication proof.
- The only safe automatic linking path: SSO login matches a local account by email AND the local account has never been used with a password (it was created by an admin invite) AND you send a confirmation email to the address.
- For user-initiated binding (account settings page): require the user to first be logged in via local auth, then complete the full SSO OIDC flow to prove ownership of the Microsoft identity.

**Detection:** Log every account-link event with IP, timestamp, both identities, and the mechanism used. Alert if the same microsoft_id is associated with multiple local accounts.

**Relevant phase:** Phase implementing SSO binding.

---

### Pitfall 2: Email Claim Used as Stable Identifier (Not Sub+Iss)

**What goes wrong:** The current `upsertUser` uses `microsoft_id` (the OIDC `sub` claim) as the stable identifier — correct. If a developer adds logic that falls back to email for lookup (e.g., "find local account where email = oidcUser.Email"), email becomes a de-facto identifier. Microsoft Entra ID allows tenant admins to change a user's email address without re-verification.

**Why it happens:** Email is human-readable and seems like a natural join key, especially when adding local auth where email is the login credential.

**Consequences:** User A changes email to match User B's local account → gains User B's session. Also causes confusion when corporate users change their email (new company domain, name change).

**Prevention:**
- Keep `microsoft_id` (sub claim) as the sole SSO identifier. Never fall back to email for SSO identity matching.
- For local accounts, email is the login credential but not a merge key for SSO. Treat them as completely different identity providers with different primary keys.
- When an SSO user is first found by `microsoft_id`, update their email in the DB — but this update should never trigger a merge with a different local account.

**Detection:** Code review gate: any DB query joining on `email` in the auth flow (outside of the local login path) is a red flag.

**Relevant phase:** Phase implementing local auth registration and SSO binding.

---

### Pitfall 3: Timing Attack on Login — Username Enumeration via Response Time

**What goes wrong:** The local login handler does an early return when no user is found (fast path), but takes significantly longer when the user exists and bcrypt comparison runs (~300ms). An attacker can enumerate valid email addresses by measuring response time: fast response = no account, slow response = account exists (even if password is wrong).

**Why it happens:** The natural code flow is: query DB → if not found return 401 → if found, compare hash → return 401/200. The hash comparison is the expensive step and it only happens on the "found" branch.

**Consequences:** Attacker builds a list of valid email/usernames before launching a targeted brute force.

**Prevention:**
- Always run bcrypt comparison even when the user is not found. Use a pre-computed "dummy hash" constant and compare against it when the lookup fails, then discard the result.
- Return the same generic error message for "email not found" and "wrong password": `{"error": "invalid credentials"}`.
- Do not return HTTP 404 for missing user — always return 401.

**Example (Go):**
```go
var dummyHash = "$2a$12$WQ9x6P6K5wn3m5nGZ2.bxO..." // pre-computed at startup

user, err := store.GetUserByEmail(ctx, email)
if err != nil {
    // Still run bcrypt to normalize response time
    bcrypt.CompareHashAndPassword([]byte(dummyHash), []byte(password))
    http.Error(w, "invalid credentials", http.StatusUnauthorized)
    return
}
```

**Detection:** Benchmark login endpoint response time for valid vs invalid email — difference should be under ~10ms.

**Relevant phase:** Phase implementing local auth login handler.

---

### Pitfall 4: Missing Rate Limiting on Login and Registration Endpoints

**What goes wrong:** The local login endpoint accepts unlimited password attempts. Without rate limiting, an attacker can run a credential stuffing or brute force attack. The registration endpoint accepts unlimited signups, enabling spam account creation.

**Why it happens:** The existing SSO flow has no login endpoint to rate-limit (it redirects to Microsoft). Developers building local auth may not add rate limiting because the existing codebase has none.

**Consequences:** Brute force attacks on known email addresses; account flooding; resource exhaustion.

**Prevention:**
- Use `github.com/go-chi/httprate` (already a chi ecosystem package) to rate-limit by IP on `/api/auth/login` and `/api/auth/register`.
- Login: 5 attempts per minute per IP. Registration: 3 per hour per IP.
- Optionally also rate-limit by email on login to prevent distributed attacks from multiple IPs against one account.
- Rate limiting must be applied before the bcrypt comparison, not after.

**Example:**
```go
r.With(httprate.LimitByIP(5, time.Minute)).Post("/auth/login", h.LocalLogin)
r.With(httprate.LimitByIP(3, time.Hour)).Post("/auth/register", h.Register)
```

**Detection:** Run a simple script sending 100 POST requests to `/api/auth/login` — should get HTTP 429 after threshold.

**Relevant phase:** Phase implementing local auth login and registration.

---

### Pitfall 5: Refresh Token Infinite Loop When Local Login Fails

**What goes wrong:** The current `apiFetch` in `frontend/src/lib/api.ts` retries any 401 by hitting `/api/auth/refresh`. If a local login is submitted and returns 401 (wrong password), the frontend silently tries to refresh — gets another 401 from refresh — and the error visible to the user may be swallowed or the component enters a retry loop.

**Why it happens:** The refresh logic was designed for session expiry, not for explicit login failure. The same status code (401) is used for both "session expired" and "bad credentials."

**Consequences:** Login form does not show an error message after wrong password; users cannot tell why login failed. Or the refresh loop hammers the backend.

**Prevention:**
- The login POST endpoint should return a structured JSON error, not a plain `http.Error`. Distinguish error types:
  - `{"code": "invalid_credentials"}` — do not retry with refresh
  - `{"code": "session_expired"}` — retry with refresh is appropriate
- Update `apiFetch` to check if the 401 came from the login endpoint itself and skip the refresh attempt.
- Alternatively, have the login handler set a response header `X-Auth-Type: credentials` so the client knows not to refresh.
- Consider using a dedicated `loginFetch` function that bypasses the refresh interceptor.

**Detection:** Submit wrong password on login page — confirm the error message renders and no extra network requests appear.

**Relevant phase:** Phase implementing local auth frontend (login form).

---

### Pitfall 6: `upsertUser` Conflict on Email When SSO User Self-Registers

**What goes wrong:** The `users` table has `UNIQUE` on `email`. If an SSO user exists (created via Microsoft login) and then tries to self-register with the same email via local auth, the INSERT fails with a unique constraint violation. If the error is not handled gracefully, the user gets a generic 500 instead of a clear "email already in use — try logging in with Microsoft."

**Why it happens:** The local registration handler inserts into `users` with `password_hash` set. It will conflict with existing rows where `email` is already taken by an SSO user.

**Consequences:** SSO users cannot add a local password; confusing error messages; potential exposure of whether an email is registered (enumeration).

**Prevention:**
- Registration handler must check if email exists AND has a `microsoft_id` but no `password_hash` — return a specific error instructing the user to log in with Microsoft first and then bind a local password via account settings.
- Do NOT return "email already taken" in a way that confirms the email is registered (enumeration risk). Balance: for industrial dashboards, email enumeration is lower risk than for consumer apps, but still worth considering.
- Define a clear user journey: SSO user → logs in with Microsoft → can optionally set a local password in account settings (binding flow). Self-registration with an email that belongs to an SSO-only account is blocked.

**Detection:** Create an SSO user, then attempt to register locally with the same email — verify the response is informative but not a 500.

**Relevant phase:** Phase implementing self-registration.

---

## Moderate Pitfalls

---

### Pitfall 7: bcrypt Cost Factor Too Low or Applied to Non-Password Fields

**What goes wrong:** Using bcrypt with cost 10 (the default in some libraries) may be too low for 2025 hardware. Also, developers sometimes accidentally apply bcrypt to API keys or tokens that need fast constant-time comparison, causing performance degradation.

**Prevention:**
- Use cost factor 12 for new deployments (balances ~300ms hashing with security). Do not go below 10.
- Use `golang.org/x/crypto/bcrypt` — the standard for Go.
- Only bcrypt passwords. Use `crypto/subtle.ConstantTimeCompare` for API keys and tokens.
- Store the cost factor in the hash itself (bcrypt does this automatically) to support future cost upgrades.

**Relevant phase:** Phase implementing password hashing.

---

### Pitfall 8: Guest Role Not Constrained at the API Layer

**What goes wrong:** Self-registered users get the "guest" role, which should have minimal permissions. If the guest role's permissions are seeded incorrectly in `009_seed_permissions.up.sql` or a migration is missed, guests could have read access to sensitive data across all sites.

**Why it happens:** The RBAC system uses `user_site_roles` — roles are scoped per site. But a global guest role with broad permissions assigned without a site scope would give access to everything.

**Prevention:**
- Self-registration should create a `user_site_roles` entry with `site_id = NULL` only if the guest role explicitly has no permissions, or with `site_id` set to a specific onboarding site.
- Verify the guest role's permissions after every migration that touches `seed_permissions`.
- Write an integration test: register as guest, call a protected endpoint (e.g., `GET /api/sites`) — verify 403.
- Consider not assigning any site role on registration and requiring an admin to assign a site before the user can access anything beyond their profile.

**Relevant phase:** Phase implementing self-registration with guest role.

---

### Pitfall 9: Password Reset Token Returned in API Response Body

**What goes wrong:** A developer implements password reset and, for convenience in testing, includes the reset token in the API response (e.g., `{"message": "email sent", "token": "abc123"}`). This mirrors CVE-2025-58434 (FlowiseAI) — tokens delivered in the response enable account takeover without email access.

**Prevention:**
- Reset tokens must ONLY be delivered via the registered email. The API response is always `{"message": "If this email exists, a reset link has been sent"}`.
- No token in response, no token in logs.
- Set reset token expiry to 20 minutes; mark as used-once on redemption.
- This project does not currently have email infrastructure — if password reset is out of scope for v0.0.3, explicitly document this and do not implement a half-finished reset flow.

**Relevant phase:** Any phase adding password reset (likely post-v0.0.3).

---

### Pitfall 10: TanStack Query Retry on 401 Causes Redirect Loop on Login Page

**What goes wrong:** The current `QueryClient` is created without custom retry configuration. TanStack Query retries failed queries 3 times by default. If a query returns 401 and the `apiFetch` refresh also fails (user is genuinely logged out), the query retries 3 more times, generating 6 total requests before the component unmounts and redirects to `/login`. On the login page, if any query is still mounted, it keeps retrying.

**Prevention:**
- Configure `QueryClient` with `defaultOptions.queries.retry: (count, error) => count < 1 && error.status !== 401`.
- The `AuthProvider` already handles the `/auth/me` check — protect routes using `ProtectedRoute` which redirects to `/login` before any data queries mount.
- Ensure queries are only enabled when `user !== null`.

**Relevant phase:** Phase implementing local auth frontend.

---

### Pitfall 11: `logout` Does Not Invalidate Server-Side Sessions (Refresh Token Reuse)

**What goes wrong:** The current `Logout` handler only clears cookies client-side. The refresh token itself is never invalidated on the server (no token revocation table). A user who logs out but whose refresh token cookie was captured (e.g., via XSS, shared device) could still obtain new access tokens for 7 days.

**Why it matters more with local auth:** With SSO-only, the token lifetime is the practical risk window. With local auth, an attacker who compromises a user's password + refresh token has persistent access even after password change.

**Prevention:**
- For v0.0.3: add a `refresh_tokens` table or a `jti` (JWT ID) revocation list. On logout, insert the jti into a revoked-tokens table. On refresh, check revocation.
- Minimum: on password change, revoke all existing refresh tokens for that user.
- If token revocation is too complex for v0.0.3, document the gap explicitly.

**Relevant phase:** Phase implementing local auth + any password-change flow.

---

### Pitfall 12: Error Messages Leaking Stack Traces or Internal Details to Frontend

**What goes wrong:** Go's `http.Error(w, err.Error(), 500)` sends the raw error message (which may include DB query text, file paths, or internal state) to the HTTP response body. The React frontend displays this in a toast or error boundary.

**Why it happens:** The current codebase uses `http.Error(w, "failed to provision user", http.StatusInternalServerError)` with hardcoded strings — relatively safe. But as local auth complexity grows (password validation, DB errors, email collisions), developers may slip and use `err.Error()` directly.

**Prevention:**
- Establish a pattern in `internal/auth/` for error translation: internal errors get logged with `slog.Error(...)`, external response is always a static string.
- Create a small `sendError(w, code int, msg string, internalErr error)` helper that logs the internal error and sends only the static message to the client.
- Use structured logging (`log/slog`) — never `fmt.Println(err)` or logging to stdout with concatenated error strings.
- On the React side: display only the `message` field from the API response, never the raw response body.

**Relevant phase:** Phase implementing error handling review (explicitly in scope for v0.0.3).

---

## Minor Pitfalls

---

### Pitfall 13: New Auth Strings Not Added to All 4 Locale Files

**What goes wrong:** Local auth introduces new UI strings (register form labels, error messages, SSO binding UI, success messages). If any string is added to `en.json` only, the other 3 locales (`zh-TW.json`, `th.json`, `vi.json`) show the key name as raw text for non-English users.

**Prevention:** Enforce the project rule: add every new key to all 4 files before submitting. Use `npm run lint` to catch missing keys if a lint rule is configured. Keep a checklist for auth-related keys.

**Relevant phase:** Every frontend phase.

---

### Pitfall 14: DEV_MODE Login Bypass Accessible in Production Build

**What goes wrong:** The frontend `LoginPage.tsx` gates the dev login link behind `import.meta.env.DEV`, which is correct for client-side. But the backend `/dev/login` endpoint may be registered regardless of `DEV_MODE` env var if the conditional is missing or mis-scoped.

**Prevention:** Verify that the Go server only registers the `/dev/login` route when `config.DevMode == true`. Add a test: build the binary with `DEV_MODE=0`, confirm `/dev/login` returns 404.

**Relevant phase:** End-to-end release validation phase (explicitly in scope for v0.0.3).

---

### Pitfall 15: Audit Log Missing for Local Auth Events

**What goes wrong:** The existing audit middleware logs mutating API calls. Registration and login are new write operations. If the audit middleware is not applied to auth routes (which may be on a different route group), login events, failed login attempts, and SSO binding actions are not in the audit trail.

**Prevention:** Confirm audit middleware is applied to `/api/auth/register`, `/api/auth/login`, and any SSO binding endpoint. For login specifically, audit on failure as well as success (write a direct audit entry, not just rely on middleware).

**Relevant phase:** Phase implementing local auth.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Local login handler (Go) | Timing attack on email enumeration | Dummy hash on not-found path |
| Local login handler (Go) | No brute force protection | httprate on login + register endpoints |
| Local login handler (Go) | Raw error strings in response | `sendError` helper, slog structured logging |
| Registration handler | SSO email collision returns 500 | Check existing `microsoft_id`, return guided error |
| Registration handler | Guest role over-permissioned | Integration test: guest cannot access protected routes |
| Registration handler | No rate limiting | httprate per IP |
| SSO binding | Auto-link by email enables account takeover | Require authenticated proof of ownership for both sides |
| SSO binding | Sub claim drift (nOAuth) | Use `microsoft_id` (sub) only; never email for SSO lookup |
| Frontend login form | 401 triggers refresh loop | Skip refresh on explicit login 401; use error code |
| Frontend login form | Auth strings missing from locales | All 4 locale files updated before PR |
| Error handling review | Stack traces in API responses | Translate all errors at boundary; log internal, send static |
| Release validation | Dev login accessible in production | Verify `/dev/login` absent when `DEV_MODE=0` |
| Release validation | Audit trail missing auth events | Confirm middleware applied to auth route group |

---

## Sources

- [Ory: Secure Account Linking — SSO, OIDC, SAML](https://www.ory.com/blog/secure-account-linking-iam-sso-oidc-saml) — HIGH confidence (official Ory documentation)
- [Descope: nOAuth — Microsoft OAuth Misconfiguration Account Takeover](https://www.descope.com/blog/post/noauth) — HIGH confidence (original vulnerability disclosure, verified by Microsoft)
- [JetBrains: Secure Go Error Handling Best Practices (March 2026)](https://blog.jetbrains.com/go/2026/03/02/secure-go-error-handling-best-practices/) — HIGH confidence (official JetBrains Go blog, published 2026-03-02)
- [OWASP: Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) — HIGH confidence (OWASP authoritative)
- [go-chi/httprate: Rate Limiter Middleware](https://github.com/go-chi/httprate) — HIGH confidence (official chi ecosystem package)
- [TanStack Query: Error Boundary Infinite Loop Discussion](https://github.com/TanStack/query/discussions/6160) — MEDIUM confidence (community discussion, verified against TanStack Query v5 docs)
- [5 Common Mistakes with Bcrypt](https://pwcreator.com/5-common-mistakes-to-avoid-when-using-bcrypt-for-password-hashing/) — MEDIUM confidence (community article, consistent with golang.org/x/crypto/bcrypt docs)
- [Password Hashing Guide 2025: Argon2 vs Bcrypt vs Scrypt](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/) — MEDIUM confidence (comprehensive 2025/2026 guide)
- [CVE-2025-58434: FlowiseAI Password Reset Token in Response](https://cvefeed.io/vuln/detail/CVE-2025-58434) — HIGH confidence (CVE record, 2025)
