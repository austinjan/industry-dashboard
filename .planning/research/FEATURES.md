# Feature Landscape

**Domain:** Local authentication, self-registration, SSO account binding, error handling
**Milestone:** v0.0.3 — Local Auth, Error Handling & Release Validation
**Researched:** 2026-03-27

---

## Context: What Already Exists

The existing system has:
- Microsoft Entra ID OIDC login (the only login path)
- JWT sessions via httpOnly cookies (access 15 min, refresh 7 days)
- `users` table with `microsoft_id` (UNIQUE), `password_hash` (column exists, unused), `email` (UNIQUE)
- Auth middleware that validates JWT and sets claims on context
- RBAC middleware consuming those claims
- `LoginPage.tsx` with a single "Sign in with Microsoft" button
- Error responses throughout backend using plain `http.Error(w, "text", status)` — plain text, no structure
- Frontend has no toast/notification system; errors are stored in local component state (`setSaveError`)

---

## Table Stakes

Features users expect when a system offers local authentication. Missing any of these makes the feature feel incomplete or unsafe.

| Feature | Why Expected | Complexity | Existing Dependency |
|---------|--------------|------------|---------------------|
| Email + password registration form | Users need to create local accounts | Low | `password_hash` column already in schema |
| Password validation (min length, confirmation) | Standard UX — reduces support burden | Low | None |
| Secure password hashing (bcrypt or Argon2id) | Security baseline — never store plaintext | Low | None (Go stdlib/x/crypto available) |
| Email + password login form | Users need to sign in | Low | JWT service already exists |
| "Wrong email or password" error (intentionally vague) | Security — don't reveal which field was wrong | Low | None |
| Guest role auto-assignment on registration | Users need a role to enter the system | Low | RBAC already exists; need guest role seeded |
| Logout works for both auth methods | Consistency — cookie clearing is already generic | None | Already implemented |
| Token issuance identical for local + SSO users | RBAC/audit middleware must not know auth method | Low | JWT service is auth-method agnostic |

---

## Differentiators

Features that add real value beyond the baseline.

| Feature | Value Proposition | Complexity | Dependency |
|---------|-------------------|------------|------------|
| Microsoft SSO binding to existing local account | Users who registered locally can later attach their Microsoft identity — one account, two login paths | Medium | Requires authenticated session + OIDC callback variant |
| Auto-link by email on first SSO login (if local account exists with verified email) | Frictionless for users who registered locally then try SSO | Medium | Security: must only auto-link when both sides share exact email and local account is verified |
| Admin can see auth method per user (local / microsoft / both) | Operational visibility for admins managing users | Low | Requires `auth_provider` column or derived field |
| "Link Microsoft account" button on user profile page | User-initiated binding — secure, explicit | Medium | Profile page does not exist yet |
| Structured JSON error responses from backend | Frontend can show specific, localised messages; not just raw text | Medium | Requires new error helper; touches all handlers |
| Toast/banner notifications for async operation results | Mutations (save, delete, bind) need feedback beyond inline state | Low | shadcn/ui already in stack; add sonner or use shadcn toast |
| i18n for all new auth and error strings | Consistency with existing 4-language support | Low | Existing i18n infrastructure handles this |

---

## Anti-Features

Features to explicitly NOT build in this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Email verification flow (send confirm link, hold account pending) | Adds complexity (email sending infrastructure, token storage, expiry), blocks registration for simple deploys with no SMTP | Assign guest role immediately on registration; admins can disable accounts if needed |
| Password reset / forgot password flow | Requires email sending infrastructure; out of scope for v0.0.3 | Admin can reset passwords directly via admin user page in a future milestone |
| Require admin approval before guest can log in | Adds workflow complexity; guest role is already read-only, so immediate access is low risk | Admin can deactivate accounts post-hoc via existing `is_active` flag |
| Multi-factor authentication (TOTP, SMS) | Significant complexity; not requested | Future milestone if enterprise requirement arises |
| Magic link / passwordless email login | Requires email infrastructure | Future milestone |
| Account merging (combine two user records into one) | High complexity, data integrity risk | Binding adds second identity to existing record; no merge needed |
| Automatic account linking without user confirmation when emails match | Security risk — attacker with unverified SSO claim can take over local account | Require user to be authenticated before linking; never auto-link silently |
| Separate "guest registration" UI from main login flow | Unnecessary split — one registration form with guest-role outcome is sufficient | Single registration form on LoginPage |

---

## Feature Dependencies

```
password_hash in users schema   --> already exists (migration 002)
guest role seed                 --> must exist before registration handler (new migration or seed)
local login handler             --> requires password_hash column + bcrypt/argon2
JWT issuance                    --> already exists; reused unchanged
SSO binding                     --> requires authenticated local session + OIDC callback variant
structured error responses      --> requires new error helper (writeError func or middleware)
frontend error display          --> requires toast system OR inline error component
i18n new strings                --> requires all 4 locale files updated
```

---

## User Flows

### Flow 1: New User — Local Registration

```
GET /login
  └─ Form: email, name, password, confirm password
  └─ Submit POST /api/auth/register
       ├─ Validate fields (all required, passwords match, password >= 8 chars)
       ├─ Check email not already taken
       ├─ Hash password (bcrypt cost 12 or Argon2id)
       ├─ Insert user with guest role
       ├─ Issue JWT (same as SSO flow)
       └─ Redirect to /
```

### Flow 2: Existing Local User — Login

```
GET /login
  └─ Form: email, password
  └─ Submit POST /api/auth/local/login
       ├─ Look up user by email
       ├─ Verify password hash (constant-time comparison)
       ├─ Check is_active = true
       ├─ Issue JWT
       └─ Redirect to /
  └─ On failure: "Invalid email or password" (intentionally vague)
```

### Flow 3: Local User — Bind Microsoft Account

```
Authenticated user on profile/settings page
  └─ Click "Connect Microsoft Account"
  └─ GET /api/auth/link/microsoft (starts OIDC flow with link intent)
       ├─ Store link intent + current user ID in state cookie
       ├─ Redirect to Microsoft OIDC
  └─ Callback: GET /api/auth/callback (same handler, detects link intent)
       ├─ Exchange code for OIDC user
       ├─ Verify microsoft_id not already bound to different user
       ├─ UPDATE users SET microsoft_id = $microsoft_id WHERE id = $current_user_id
       └─ Redirect to profile with success toast
```

### Flow 4: SSO User — First Login, Local Account with Same Email Already Exists

Two safe options — pick one:
- **Option A (recommended):** Treat as separate account issue, show "An account with this email already exists. Sign in with email/password and connect Microsoft from your profile." — no silent merge.
- **Option B:** If the local account has no `microsoft_id` yet AND the local account's email matches the verified OIDC email, auto-bind the microsoft_id and log the user in. Only valid when OIDC `email_verified: true`.

Option A is simpler to implement and more auditable. Option B reduces friction but requires careful verification. Recommend **Option A for v0.0.3**.

### Flow 5: Error Handling — Structured Response

```
Backend error (any handler):
  └─ writeError(w, status, code, message)
       └─ JSON: { "error": "email_taken", "message": "An account with this email already exists." }

Frontend receives non-2xx:
  └─ Parse JSON error body
  └─ Map error code to i18n key
  └─ Show toast or inline error message
```

---

## MVP Recommendation

Build in this order:

1. **Local registration + login** — Unblocks all users without Microsoft credentials. Low risk, schema already supports it.
2. **Guest role seed** — Required before registration works end-to-end.
3. **Structured error responses** — Implement `writeError` helper once, apply to new auth endpoints; backfill critical paths (auth, user creation) in same PR.
4. **Frontend error display** — Add toast system (shadcn/ui Sonner or built-in toast); wire to `apiFetch` for non-2xx; replace per-component `setSaveError` pattern in new pages.
5. **i18n strings** — Thread through all 4 locale files for every new string.
6. **SSO binding** — Add after local auth is stable. Separate PR; requires profile/settings page.
7. **Release validation** — End-to-end build + deploy test per `docs/deploy.md`.

**Defer:**
- Email verification: No SMTP infrastructure; guest role is safe without it.
- Password reset: No SMTP; admin workaround acceptable for v0.0.3.
- Admin approval workflow: `is_active` flag is sufficient escape hatch.

---

## Complexity Notes

| Feature | Backend Effort | Frontend Effort | Notes |
|---------|---------------|-----------------|-------|
| Local registration | Low | Low | Schema ready; bcrypt is stdlib-adjacent |
| Local login | Low | Low | JWT service reused unchanged |
| Guest role seed | Low | None | One SQL migration |
| SSO binding | Medium | Medium | OIDC callback variant + state tracking |
| Structured errors | Medium | Low | New helper + backfill all handlers |
| Toast system | None | Low | shadcn/ui has built-in; one wiring point in apiFetch |
| i18n (auth strings) | None | Low | Routine; 4 files |
| Release validation | None | None | Manual process |

---

## Sources

- [WorkOS — Lessons in Safe Identity Linking](https://workos.com/blog/lessons-in-safe-identity-linking) — MEDIUM confidence (verified against Auth0 docs pattern)
- [Auth0 — User Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking) — MEDIUM confidence
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) — HIGH confidence (IETF standard, successor to RFC 7807)
- [Go Dev Community — Argon2 vs bcrypt for Go](https://dev.to/nikita_rykhlov/go-tools-password-hashing-with-argon2-instead-of-bcrypt-38aj) — MEDIUM confidence
- [JetBrains GoLand Blog — Secure Go Error Handling Best Practices (2026-03-02)](https://blog.jetbrains.com/go/2026/03/02/secure-go-error-handling-best-practices/) — MEDIUM confidence
- Codebase analysis: `internal/auth/`, `migrations/002_create_auth.up.sql`, `frontend/src/pages/LoginPage.tsx` — HIGH confidence (direct inspection)
