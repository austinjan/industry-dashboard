# Industry Dashboard

## What This Is

A customizable multi-factory industrial monitoring dashboard for production lines, machine status, and operational metrics. Users configure what to monitor; AI generates UI layouts via json-render. Built with React + TypeScript frontend and Go backend on TimescaleDB.

## Core Value

Real-time visibility into factory operations with customizable dashboards that adapt to each site's monitoring needs.

## Requirements

### Validated

- ✓ Foundation (auth, RBAC, audit trail, site/line/machine CRUD) — v0.0.1
- ✓ Traditional dashboards (alerts, machine status, data visualization) — v0.0.1
- ✓ Custom dashboards (widget system, drag-and-drop builder) — v0.0.1
- ✓ LLM integration (dashboard-cli, API key auth) — v0.0.1
- ✓ Deployment infrastructure (Docker, embedded frontend, cross-compilation) — v0.0.1
- ✓ i18n (EN, zh-TW, th, vi) — v0.0.1
- ✓ Deploy improvements (.env support, simplified setup) — v0.0.2
- ✓ Modbus workers (data ingestion, coordinator, fake/real datasources) — v0.0.2
- ✓ Worker Config Builder UI (YAML generation, admin pages) — v0.0.2

### Active

- [x] Local authentication (email/password registration and login) — Validated in Phase 1: Backend Local Auth
- [x] Self-registration with guest role — Validated in Phase 1: Backend Local Auth (Viewer role assigned on register)
- [ ] Optional Microsoft SSO binding to local accounts
- [x] Error handling review (clear frontend messages, accurate descriptions, system logging) — Validated in Phase 2: Error Handling (apierr package, structured JSON errors, slog logging)
- [ ] End-to-end release validation (build, download, deploy per deploy.md)

### Out of Scope

- json-render AI generation — future, after manual builder is stable

## Context

- Current auth is Microsoft Entra ID (Azure AD) only via OIDC — system unusable without Microsoft credentials
- Existing RBAC middleware uses JWT sessions — local auth must produce compatible JWTs
- Dev mode (`DEV_MODE=1`) provides `/dev/login` bypass for local testing
- Four languages supported: EN, zh-TW, th, vi
- Design spec: `docs/superpowers/specs/2026-03-20-industry-dashboard-design.md`

## Constraints

- **Tech stack**: React 18 + TypeScript + Vite frontend, Go backend with chi router, TimescaleDB
- **Auth compatibility**: New local auth must integrate with existing RBAC and audit middleware
- **i18n**: All new user-facing strings must be added to all 4 locale files
- **API policy**: Any API changes must be reflected in dashboard-cli

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Microsoft Entra ID for SSO | Enterprise requirement | ✓ Good — but needs local auth fallback |
| Custom RBAC over framework | Site-scoped permissions needed | ✓ Good |
| TimescaleDB for time-series | Production metrics are time-series data | ✓ Good |
| json-render for AI layouts | Generative UI for dashboard customization | — Pending |

## Current Milestone: v0.0.3 Local Auth, Error Handling & Release Validation

**Goal:** Add local user accounts so the system works without Microsoft credentials, improve error handling across the system, and validate the full release/deploy pipeline.

**Target features:**
- Local authentication (email/password registration and login)
- Self-registration with guest role
- Optional Microsoft SSO binding to local accounts
- Error handling review — clear messages shown in frontend, accurate descriptions, logged in system logs
- End-to-end release testing (build, download, deploy following deploy.md)

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after Phase 2 (Error Handling) complete*
