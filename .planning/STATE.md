---
gsd_state_version: 1.0
milestone: v0.0.3
milestone_name: milestone
status: executing
stopped_at: Phase 3 context gathered
last_updated: "2026-03-27T11:38:17.630Z"
last_activity: 2026-03-27
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Real-time visibility into factory operations with customizable dashboards that adapt to each site's monitoring needs.
**Current focus:** Phase 02 — error-handling

## Current Position

Phase: 3
Plan: Not started
Status: Ready to execute
Last activity: 2026-03-27

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

### Pending Todos

None yet.

### Blockers/Concerns

- Guest role may already exist in seed data — verify against 009_seed_permissions.up.sql before Phase 1 migration
- apiFetch refresh interceptor behaviour needs verification before Phase 3 (skip refresh on invalid_credentials code)
- authHandler NewHandler nil-safety for local-only deployments needs assessment before Phase 1

## Session Continuity

Last session: 2026-03-27T11:38:17.628Z
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-frontend-auth-ui/03-CONTEXT.md
