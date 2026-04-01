---
gsd_state_version: 1.0
milestone: v0.0.3
milestone_name: milestone
status: verifying
stopped_at: Completed 03-frontend-auth-ui 03-02-PLAN.md
last_updated: "2026-04-01T08:10:40.856Z"
last_activity: 2026-04-01
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 10
  completed_plans: 10
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Real-time visibility into factory operations with customizable dashboards that adapt to each site's monitoring needs.
**Current focus:** Phase 03 — frontend-auth-ui

## Current Position

Phase: 04
Plan: Not started
Status: Phase complete — ready for verification
Last activity: 2026-04-01

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01-backend-local-auth P01 | 5 | 2 tasks | 6 files |
| Phase 01-backend-local-auth P02 | 4min | 2 tasks | 3 files |
| Phase 01-backend-local-auth P03 | 20min | 2 tasks | 2 files |
| Phase 02-error-handling P01 | 15min | 2 tasks | 5 files |
| Phase 02-error-handling P02 | 20min | 2 tasks | 8 files |
| Phase 04-sso-binding P01 | 8min | 2 tasks | 7 files |
| Phase 04-sso-binding P02 | 5min | 2 tasks | 9 files |
| Phase 03-frontend-auth-ui P01 | 5min | 2 tasks | 5 files |
| Phase 03-frontend-auth-ui P02 | 5min | 2 tasks | 4 files |

## Accumulated Context

### Decisions

- v0.0.3: SSO binding must NOT auto-link by email (nOAuth vulnerability) — user-initiated only while authenticated
- v0.0.3: No toast notifications — user prefers inline error display
- v0.0.3: Error shape is {code, message} — RFC 7807 explicitly rejected in favour of simpler shape
- v0.0.3: dummy bcrypt on not-found login path — prevents email enumeration via timing
- [Phase 01-backend-local-auth]: bcrypt cost 12 for password hashing with pre-computed dummy hash for timing-safe not-found path
- [Phase 01-backend-local-auth]: registered_via column defaults to 'microsoft' so all existing SSO rows are correctly categorised
- [Phase 01-backend-local-auth]: LoginLocal skips @ validation — admin account uses 'admin' as email with no @ sign (Pitfall 5)
- [Phase 01-backend-local-auth]: SeedDefaultAdmin is package-level function called at server startup before handler wired
- [Phase 01-backend-local-auth]: Providers endpoint always includes local, adds microsoft only when OIDCClient is non-nil
- [Phase 01-backend-local-auth]: authHandler always constructed regardless of Azure config — local auth works without OIDC
- [Phase 01-backend-local-auth]: Rate limits: 5/min for login (brute-force), 3/hr for register (spam prevention)
- [Phase 01-backend-local-auth]: Dev-mode /api/auth fallback removed — real handlers cover all paths now authHandler is always non-nil
- [Phase 02-error-handling]: apierr does not import internal/auth — userID passed as string to avoid circular import
- [Phase 02-error-handling]: RBAC errors include userID from claims for log correlation; rbac.internal_error code for HasPermission DB failures
- [Phase 02-error-handling]: writeError/apiError in auth package deleted entirely (clean cut D-11) — no shim left behind
- [Phase 02-error-handling]: alert.invalid_request used for unauthorized access in alert handlers (vs alert.invalid_input for body parsing)
- [Phase 04-sso-binding]: oauth_bind_state cookie used for bind CSRF (not oauth_state) to avoid collision with login flow
- [Phase 04-sso-binding]: AuditLogger interface defined in auth package, adapted in main.go to avoid circular import
- [Phase 04-sso-binding]: Bind callback uses JWT claims for user identity (not OIDC response) to enforce user-initiated requirement and prevent nOAuth
- [Phase 04-sso-binding]: AccountPage uses <a href> (not react-router Link) for Microsoft bind button — OIDC redirect must be full-page navigation
- [Phase 04-sso-binding]: refreshUser() added to AuthContext so AccountPage can reload user data after bind redirect without re-mounting AuthProvider
- [Phase 03-frontend-auth-ui]: AUTH_NO_REFRESH_PATHS checked via path.startsWith() so /auth/login/local and /auth/register never trigger refresh retry
- [Phase 03-frontend-auth-ui]: Existing 'login' section preserved unchanged; new 'auth' section added alongside it for form-based auth UI
- [Phase 03-frontend-auth-ui]: Login input type=text (not type=email) so admin account (username: 'admin', no @ sign) can log in
- [Phase 03-frontend-auth-ui]: mapAuthError extracted to lib/auth-errors.ts shared by LoginPage, RegisterPage, and AccountPage
- [Phase 03-frontend-auth-ui]: SSO button visibility driven at runtime by /api/auth/providers fetch on mount, not build-time config

### Pending Todos

None yet.

### Blockers/Concerns

- Guest role may already exist in seed data — verify against 009_seed_permissions.up.sql before Phase 1 migration
- apiFetch refresh interceptor behaviour needs verification before Phase 3 (skip refresh on invalid_credentials code)
- authHandler NewHandler nil-safety for local-only deployments needs assessment before Phase 1

## Session Continuity

Last session: 2026-03-31T08:29:53.154Z
Stopped at: Completed 03-frontend-auth-ui 03-02-PLAN.md
Resume file: None
