# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-27)

**Core value:** Real-time visibility into factory operations with customizable dashboards that adapt to each site's monitoring needs.
**Current focus:** Phase 1 — Backend Local Auth

## Current Position

Phase: 1 of 5 (Backend Local Auth)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-03-27 — Roadmap created for v0.0.3

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

## Accumulated Context

### Decisions

- v0.0.3: SSO binding must NOT auto-link by email (nOAuth vulnerability) — user-initiated only while authenticated
- v0.0.3: No toast notifications — user prefers inline error display
- v0.0.3: Error shape is {code, message} — RFC 7807 explicitly rejected in favour of simpler shape
- v0.0.3: dummy bcrypt on not-found login path — prevents email enumeration via timing

### Pending Todos

None yet.

### Blockers/Concerns

- Guest role may already exist in seed data — verify against 009_seed_permissions.up.sql before Phase 1 migration
- apiFetch refresh interceptor behaviour needs verification before Phase 3 (skip refresh on invalid_credentials code)
- authHandler NewHandler nil-safety for local-only deployments needs assessment before Phase 1

## Session Continuity

Last session: 2026-03-27
Stopped at: Roadmap written, ready to plan Phase 1
Resume file: None
