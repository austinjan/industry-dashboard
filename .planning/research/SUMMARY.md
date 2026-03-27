# Project Research Summary

**Project:** Industry Dashboard — v0.0.3 Local Auth, SSO Binding, Error Handling
**Domain:** Authentication system extension — adding local credentials alongside existing Microsoft Entra ID SSO
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

This milestone adds local email/password authentication to a Go + React industrial dashboard that currently only supports Microsoft Entra ID SSO. The existing schema already has a `password_hash` column in the `users` table, and the JWT issuance, RBAC, and audit middleware are all auth-method-agnostic — they operate on `UserID` after authentication, requiring zero changes to work with locally-authenticated users. This is a strong foundation: the implementation adds new handlers and a thin utility layer on top of existing infrastructure without modifying the security-critical core.

The recommended approach is to build in strict dependency order: database migrations first, then backend handlers (local auth before SSO binding), then frontend, then error handling backfill. The key technology additions are minimal — `golang.org/x/crypto/bcrypt` (already an indirect dependency, needs promotion to direct), `github.com/go-chi/httprate` for rate limiting, and a small internal `httputil` package for structured JSON error responses. No new frontend packages are required; `react-hook-form`, `zod`, and `shadcn/ui` already cover all form and display needs.

The primary risks are security-related, not complexity-related. The nOAuth vulnerability (account takeover via SSO-to-local auto-linking by email) is the most dangerous pitfall and must be prevented by design: the OIDC callback must never silently merge a Microsoft identity into a local account based on email match alone. The correct model is user-initiated binding with explicit proof of ownership. Secondary risks include timing attacks on the login endpoint (solvable with a dummy bcrypt comparison on not-found path), missing rate limiting (solvable with httprate), and the `apiFetch` refresh interceptor incorrectly retrying a 401 login failure (solvable with structured error codes that the frontend can distinguish).

## Key Findings

### Recommended Stack

The existing stack requires only minor additions. `golang.org/x/crypto/bcrypt` is already in `go.mod` as an indirect dependency and simply needs promotion. `github.com/go-chi/httprate` v0.15.0 integrates directly with chi's middleware pattern as a single `.With()` call per route. All frontend form capability exists: `react-hook-form` v7 + `zod` v4 + `shadcn/ui` components are already installed. The deliberate choice to avoid external libraries (no RFC 7807, no `chi/render`, no `ozzo-validation`) keeps the surface area small — a 15-line `httputil` helper handles all error response needs.

**Core technologies:**
- `golang.org/x/crypto/bcrypt` — password hashing — already indirect dep, use cost 12, 72-byte input limit enforced server-side
- `github.com/go-chi/httprate` v0.15.0 — per-IP rate limiting — chi ecosystem, sliding window, zero-config for common case
- `internal/httputil` (new, no external dep) — structured JSON errors — `{code, message}` shape, machine-readable codes for frontend i18n mapping
- `react-hook-form` + `zod` + `shadcn/ui` — registration and login forms — all already present in `package.json`

### Expected Features

The feature set is well-bounded with clear must-haves and explicit deferrals. The schema already supports local auth (`password_hash` column, `email UNIQUE` constraint). The only missing DB prerequisite is a `registered_via` column (migration 022) and a `Guest` role seed.

**Must have (table stakes):**
- Email + password registration form with guest role auto-assignment — schema ready, RBAC ready
- Email + password login with intentionally vague error responses — JWT service reused unchanged
- `GET /api/auth/providers` endpoint — frontend needs to know whether to render the Microsoft SSO button
- Structured JSON error responses across all auth handlers — prerequisite for frontend error display
- i18n strings for all new auth UI in all 4 locale files — project baseline requirement

**Should have (differentiators):**
- Microsoft SSO binding (user-initiated from account settings page) — users who registered locally can later attach their Microsoft identity
- Admin visibility into auth method per user (`registered_via` column) — operational value
- Toast notifications for async mutation results — shadcn/ui Sonner already available; replaces per-component `setSaveError` pattern

**Defer to post-v0.0.3:**
- Email verification flow — requires SMTP infrastructure not present
- Password reset / forgot password — requires SMTP; admin can reset directly in future milestone
- Admin approval before guest can log in — `is_active` flag is sufficient escape hatch
- Multi-factor authentication — not requested

### Architecture Approach

The implementation is additive. New files (`internal/auth/local.go`, `internal/auth/password.go`, `internal/httputil/respond.go`) contain all new behavior. Existing files (`internal/auth/handler.go`, `cmd/server/main.go`) receive targeted modifications: `upsertUser` logic update for the email-match case, `NewHandler` made nil-safe for deployments without Azure, and new route registrations. The Auth → RBAC → Audit middleware chain requires no changes — it already operates purely on `UserID` extracted from JWT claims, regardless of how that JWT was issued.

**Major components:**
1. `internal/auth/password.go` — bcrypt HashPassword / CheckPassword utilities; bcrypt cost 12; dummy hash for constant-time not-found path
2. `internal/auth/local.go` — RegisterLocal, LoginLocal, BindMicrosoftCallback handlers; all produce standard JWT cookies via existing JWTService
3. `internal/httputil/respond.go` — WriteError / WriteJSON helpers; machine-readable error codes; used by new handlers, gradually backfilled into existing handlers
4. `migrations/022_*` — `registered_via` column + Guest role seed; prerequisite for registration handler
5. `LoginPage.tsx` (modified) + `RegisterPage.tsx` (new) + `AccountPage.tsx` (new) — frontend auth flow; providers check gates Microsoft SSO button rendering

### Critical Pitfalls

1. **nOAuth account takeover via email-match SSO auto-linking** — Never silently merge a Microsoft identity into a local account based on email match. The OIDC callback should show a clear message directing the user to log in locally first, then bind from account settings. Auto-linking requires explicit authenticated proof from both sides.

2. **Timing attack enables email enumeration** — When a local login fails because the email does not exist, always run a dummy bcrypt comparison before returning 401. Without this, response time difference (~300ms) reveals whether an email is registered.

3. **Missing rate limiting on auth endpoints** — Apply `httprate.LimitByIP` on `/api/auth/register` (3/hour) and `/api/auth/login` (5/minute) before any other logic. The existing codebase has no rate limiting because SSO offloads that concern to Microsoft. Local auth reintroduces brute force exposure.

4. **`apiFetch` refresh interceptor retrying a 401 login failure** — The current `apiFetch` retries any 401 via `/api/auth/refresh`. A wrong-password response is also a 401. Use structured error codes (`{"code": "invalid_credentials"}`) and update the frontend to skip the refresh attempt when the 401 originates from the login endpoint itself.

5. **SSO user + local registration email collision returns 500** — The `users.email` UNIQUE constraint causes an unhandled INSERT failure if an SSO-created user tries to self-register. The registration handler must check for existing `microsoft_id` on conflict and return a specific guided error, not a raw 500.

## Implications for Roadmap

Based on the dependency graph from ARCHITECTURE.md and the security sequencing from PITFALLS.md, six phases are suggested:

### Phase 1: Database Foundation
**Rationale:** All backend handlers depend on the schema being correct. Run migrations before writing any handler code to avoid discovering column mismatches mid-implementation.
**Delivers:** Migration 022 (`registered_via` column, `email_verified` column, `verification_token` columns) and Guest role seed.
**Addresses:** Guest role auto-assignment on registration; `registered_via` drives frontend decisions (show/hide "Change password", "Link Microsoft").
**Avoids:** Discovering the Guest role is missing after the registration handler is written; schema drift between handler assumptions and actual DB.

### Phase 2: Backend — Local Auth (Register + Login)
**Rationale:** Local auth has no dependency on SSO binding, and it unblocks all users without Microsoft credentials. It is also the prerequisite for SSO binding (you must have a local account to bind to).
**Delivers:** `POST /api/auth/register`, `POST /api/auth/login/local`, `GET /api/auth/providers`; `internal/auth/password.go`; httprate rate limiting on both mutation endpoints; dummy-hash timing fix; `registered_via` set on INSERT.
**Avoids:** Pitfalls 3 (timing attack), 4 (no rate limiting), 6 (email collision 500).

### Phase 3: Error Handling Infrastructure
**Rationale:** New auth handlers need structured errors from day one. Backfilling error format into existing handlers is a separate, low-risk pass that does not block feature work but should complete before the frontend is wired.
**Delivers:** `internal/httputil/respond.go`; all auth handlers migrated to structured `{code, message}` responses; error code table established; critical non-auth handlers backfilled.
**Avoids:** Pitfall 12 (stack traces in API responses); inconsistent error shapes blocking frontend i18n mapping.

### Phase 4: Frontend — Login and Registration
**Rationale:** Backend must be complete and error-response shape must be stable before wiring the frontend, to avoid rebuilding error handling twice.
**Delivers:** `LoginPage.tsx` updated (providers check, local login form, register link); `RegisterPage.tsx` (new); `/register` route; all 4 locale files updated; `apiFetch` updated to skip refresh on `invalid_credentials`; TanStack Query retry config for 401.
**Avoids:** Pitfall 5 (refresh loop on login 401); Pitfall 10 (TanStack retry loop); Pitfall 13 (missing i18n strings).

### Phase 5: SSO Binding
**Rationale:** SSO binding is the highest-security-risk feature and requires local auth to already exist. Implementing it as a separate phase after local auth is stable reduces the chance of introducing the nOAuth vulnerability while juggling multiple unfinished flows.
**Delivers:** Modified `upsertUser` (email-match handling for first SSO login of a locally-registered user); `BindMicrosoftCallback` handler; `AccountPage.tsx` with "Link Microsoft Account" button; OIDC state encoding for `action=bind`; audit log for bind events.
**Avoids:** Pitfall 1 (nOAuth account takeover); Pitfall 2 (email as SSO identifier); Pitfall 14 (dev login in production).

### Phase 6: Release Validation
**Rationale:** Explicitly in scope for v0.0.3. Catches integration issues that unit tests miss, particularly around the dev mode bypass and end-to-end deploy behavior.
**Delivers:** Full registration → login → SSO bind flow tested; Microsoft SSO still works (upsert merge logic verified); Guest role RBAC enforcement verified (integration test); dev login absent when `DEV_MODE=0`; deploy per `docs/deploy.md` completed.
**Avoids:** Pitfall 14 (dev login in production); Pitfall 8 (guest role over-permissioned); Pitfall 15 (audit trail missing auth events).

### Phase Ordering Rationale

- Phases 1-2 are ordered by hard dependencies: schema before handlers, handlers before frontend.
- Phase 3 (error handling) is placed before Phase 4 (frontend) because frontend error display depends on stable error shape.
- Phase 5 (SSO binding) is deliberately last among feature phases because it carries the highest security risk (nOAuth) and requires local auth to be complete and tested first.
- Phase 6 (validation) is always last; it verifies the full system, not individual components.

### Research Flags

Phases with well-documented patterns (skip research-phase):
- **Phase 1:** Standard SQL migrations; patterns already established in this repo's migration history.
- **Phase 2:** bcrypt and chi middleware are mature, well-documented; local login/register is a solved problem.
- **Phase 3:** Internal helper pattern; no external dependency choices to research.
- **Phase 4:** All frontend packages already in use; TanStack Query and react-hook-form patterns are established in this codebase.

Phases that may need targeted research during planning:
- **Phase 5 (SSO binding):** The OIDC state-encoding approach for `action=bind` and the exact callback flow for link-vs-login detection may benefit from a focused research pass on PKCE state parameter handling and CSRF protection during binding. The nOAuth mitigations are well-documented but the implementation details of "authenticated user initiates OIDC flow" have edge cases worth reviewing.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technology choices verified against official docs; bcrypt and httprate are the dominant Go ecosystem choices with no credible alternatives for this use case |
| Features | HIGH | Based on direct codebase inspection; existing schema, JWT service, and RBAC are known quantities; feature scope is clear and bounded |
| Architecture | HIGH | Based on direct analysis of all relevant source files (`internal/auth/`, `migrations/`, `frontend/src/`); integration points are explicit |
| Pitfalls | HIGH | Security pitfalls sourced from OWASP, official vulnerability disclosures (nOAuth/Descope), and CVE records; Go-specific pitfalls verified against official crypto docs |

**Overall confidence:** HIGH

### Gaps to Address

- **Guest role permissions:** The research confirms the Guest role must be seeded, but the exact permission set has not been verified against `009_seed_permissions.up.sql`. During Phase 1 planning, verify whether `Guest` already exists in the seed data and what permissions it has. If it exists with over-broad permissions, a corrective migration is needed before registration is wired.

- **`apiFetch` refresh interceptor implementation:** The current behavior of the 401 refresh loop needs to be verified against the actual `frontend/src/lib/api.ts` implementation before Phase 4. The fix (skip refresh on `invalid_credentials` code) depends on the exact current implementation shape.

- **Token revocation on logout:** Pitfall 11 (refresh token not invalidated server-side on logout) is documented but explicitly scoped out of v0.0.3 unless a password-change flow is added. If password change is added in any phase, revisit this gap. Document the limitation explicitly in the release validation phase.

- **`authHandler` nil-safety for local-only deployments:** The current `NewHandler` requires `*OIDCClient`. If local auth routes are always registered regardless of Azure config, `NewHandler` must be refactored to accept a nil oidcClient. This is a small but non-trivial change to the handler constructor; verify the full impact on existing test coverage before Phase 2 begins.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `internal/auth/`, `migrations/002_create_auth.up.sql`, `migrations/003_create_rbac.up.sql`, `migrations/009_seed_permissions.up.sql`, `cmd/server/main.go`, `frontend/src/lib/auth.tsx`, `frontend/src/pages/LoginPage.tsx`
- [golang.org/x/crypto/bcrypt — pkg.go.dev](https://pkg.go.dev/golang.org/x/crypto/bcrypt)
- [go-chi/httprate v0.15.0 — GitHub](https://github.com/go-chi/httprate)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [Descope: nOAuth — Microsoft OAuth Misconfiguration Account Takeover](https://www.descope.com/blog/post/noauth)
- [Ory: Secure Account Linking — SSO, OIDC, SAML](https://www.ory.com/blog/secure-account-linking-iam-sso-oidc-saml)
- [CVE-2025-58434: FlowiseAI Password Reset Token in Response](https://cvefeed.io/vuln/detail/CVE-2025-58434)
- [JetBrains: Secure Go Error Handling Best Practices (2026-03-02)](https://blog.jetbrains.com/go/2026/03/02/secure-go-error-handling-best-practices/)

### Secondary (MEDIUM confidence)
- [WorkOS: Lessons in Safe Identity Linking](https://workos.com/blog/lessons-in-safe-identity-linking)
- [Auth0: User Account Linking](https://auth0.com/docs/manage-users/user-accounts/user-account-linking)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) — reviewed and explicitly rejected in favor of simpler {code, message} shape
- [TanStack Query: Error Boundary Infinite Loop Discussion](https://github.com/TanStack/query/discussions/6160)
- [Password Hashing Guide 2025/2026: Argon2 vs Bcrypt](https://guptadeepak.com/the-complete-guide-to-password-hashing-argon2-vs-bcrypt-vs-scrypt-vs-pbkdf2-2026/)

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
