# Roadmap: Industry Dashboard v0.0.3

## Overview

This milestone adds local email/password authentication alongside the existing Microsoft Entra ID SSO, standardizes error handling across the backend and frontend, and validates the full release pipeline. Phases are ordered by hard dependency: database schema first, then backend handlers, then error infrastructure, then frontend UI, then the highest-risk feature (SSO binding), and finally end-to-end release validation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Backend Local Auth** - Register and login with email/password, rate limiting, Guest role migration (completed 2026-03-27)
- [x] **Phase 2: Error Handling** - Structured JSON errors across all backend handlers and structured logging (completed 2026-03-27)
- [ ] **Phase 3: Frontend Auth UI** - Login and registration pages wired to backend, inline error display
- [ ] **Phase 4: SSO Binding** - User-initiated Microsoft account linking from account settings page
- [ ] **Phase 5: Release Validation** - End-to-end release pipeline verified, dev login confirmed absent in production

## Phase Details

### Phase 1: Backend Local Auth
**Goal**: Users can register and log in with a local email and password, producing valid JWTs accepted by the existing RBAC middleware
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. A new user can POST to /api/auth/register with email and password and receive a JWT session cookie
  2. A registered user can POST to /api/auth/login/local with correct credentials and receive a JWT session cookie
  3. Login with wrong password returns 401 with no timing difference compared to a non-existent email (dummy bcrypt applied)
  4. More than 5 login attempts per minute from the same IP are rejected with 429
  5. GET /api/auth/providers returns the list of available auth methods so the frontend knows what to render
**Plans:** 3/3 plans complete
Plans:
- [x] 01-01-PLAN.md — Foundation: dependencies, password utilities, error helper, migration 022
- [x] 01-02-PLAN.md — Auth handlers: RegisterLocal, LoginLocal, Providers, nil-safe handler, SeedDefaultAdmin
- [x] 01-03-PLAN.md — Wiring: main.go routes with rate limiting, dead code removal, comprehensive tests

### Phase 2: Error Handling
**Goal**: Backend returns structured JSON errors everywhere and all errors appear in system logs with full request context
**Depends on**: Phase 1
**Requirements**: ERR-01, ERR-03
**Success Criteria** (what must be TRUE):
  1. Every API error response uses the shape {code, message} — no plain-text errors remain in any handler
  2. Machine-readable error codes are consistent (e.g., invalid_credentials, email_taken, not_found) across all handlers
  3. Every error logged by slog includes request ID and user ID where available — no errors are swallowed silently
**Plans:** 1/3 plans executed
Plans:
- [x] 02-01-PLAN.md — Foundation: shared apierr package with Write() + slog, RequestID middleware, auth/rbac middleware conversion
- [x] 02-02-PLAN.md — Auth package migration + 5 large domain handlers (site, alert, worker_config, worker_api, dashboard)
- [x] 02-03-PLAN.md — Remaining handlers (rbac, llmauth, datapoint, user, audit) + main.go dev routes + verification sweep

### Phase 3: Frontend Auth UI
**Goal**: Users can register, log in, and see clear inline error messages in all four supported languages
**Depends on**: Phase 2
**Requirements**: ERR-02
**Success Criteria** (what must be TRUE):
  1. The login page shows a local email/password form in addition to the Microsoft SSO button (button visible only when providers response includes Microsoft)
  2. A new user can navigate to /register, fill in the form, and land on the dashboard as a guest
  3. Wrong password on login shows an inline error message directly on the form — no toast, no redirect
  4. All new form labels, error messages, and button text appear correctly in EN, zh-TW, th, and vi
  5. A 401 returned by the login endpoint does not trigger the apiFetch refresh interceptor loop
**Plans:** 2 plans
Plans:
- [ ] 03-01-PLAN.md — Fix apiFetch 401 interceptor, add auth i18n keys to all 4 locales
- [ ] 03-02-PLAN.md — Rewrite LoginPage, create RegisterPage, wire /register route, visual verification
**UI hint**: yes

### Phase 4: SSO Binding
**Goal**: A locally-registered user can link their Microsoft account from the account settings page, without risk of account takeover via email matching
**Depends on**: Phase 3
**Requirements**: SSO-01, SSO-02
**Success Criteria** (what must be TRUE):
  1. An authenticated local user can click "Link Microsoft Account" on the account page and complete the OIDC flow to bind their Microsoft identity
  2. The account page displays which auth methods are active (local password set, Microsoft linked or not)
  3. A user who visits the login page with a Microsoft account that matches an existing local email sees a guided message to log in locally first — no silent auto-link occurs
  4. The SSO bind action is recorded in the audit log
**Plans:** 2 plans
Plans:
- [ ] 04-01-PLAN.md — Backend: migration 023 (microsoft_email), config, OIDCClient bind methods, bind handlers, Me() extension, audit logging, route wiring
- [ ] 04-02-PLAN.md — Frontend: AccountPage with auth method status, User interface extension, i18n (4 locales), TopNav link, route registration, visual verification
**UI hint**: yes

### Phase 5: Release Validation
**Goal**: The full release pipeline works end-to-end and the dev login bypass cannot appear in a production build
**Depends on**: Phase 4
**Requirements**: REL-01, REL-02
**Success Criteria** (what must be TRUE):
  1. Following deploy.md exactly from a clean environment produces a running instance — no undocumented steps required
  2. The complete registration → login → SSO bind flow works on a deployed instance
  3. The /dev/login endpoint returns 404 when DEV_MODE is not set, and is absent from the production binary
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Backend Local Auth | 3/3 | Complete   | 2026-03-27 |
| 2. Error Handling | 3/3 | Complete | 2026-03-27 |
| 3. Frontend Auth UI | 0/2 | Not started | - |
| 4. SSO Binding | 0/2 | Not started | - |
| 5. Release Validation | 0/? | Not started | - |
