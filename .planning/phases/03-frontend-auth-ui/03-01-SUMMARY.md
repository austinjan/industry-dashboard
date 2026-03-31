---
phase: 03-frontend-auth-ui
plan: 01
subsystem: auth
tags: [react, typescript, i18n, api-client, 401-interceptor, locale]

# Dependency graph
requires:
  - phase: 02-error-handling
    provides: structured JSON error responses consumed by frontend fetch layer
provides:
  - apiFetch 401 interceptor with auth endpoint exemption (no refresh loop on bad credentials)
  - auth form and error i18n keys in all 4 locale files (en, zh-TW, th, vi)
affects: [03-02-PLAN.md, login page, register page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AUTH_NO_REFRESH_PATHS constant for path-based 401 exemption in apiFetch"
    - "Auth i18n namespace 'auth' separate from existing 'login' section"

key-files:
  created: []
  modified:
    - frontend/src/lib/api.ts
    - frontend/src/locales/en.json
    - frontend/src/locales/zh-TW.json
    - frontend/src/locales/th.json
    - frontend/src/locales/vi.json

key-decisions:
  - "AUTH_NO_REFRESH_PATHS checked via path.startsWith() so /auth/login/local and /auth/register never trigger refresh retry"
  - "Existing 'login' section preserved unchanged; new 'auth' section added alongside it for form-based auth UI"

patterns-established:
  - "Path-based 401 exemption: add to AUTH_NO_REFRESH_PATHS array for any future auth credential endpoints"
  - "Auth i18n keys use 'auth.' prefix with camelCase error keys (errorXxx pattern)"

requirements-completed: [ERR-02]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 3 Plan 1: Frontend Auth UI - Interceptor Fix and i18n Keys Summary

**apiFetch 401 interceptor updated with AUTH_NO_REFRESH_PATHS exemption, plus 21-key 'auth' section added to all 4 locale files for login/register form UI**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T08:25:55Z
- **Completed:** 2026-03-31T08:30:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed apiFetch to skip token refresh retry when /auth/login/local or /auth/register returns 401 — prevents infinite refresh loops on bad credentials
- Added complete 'auth' i18n section (21 keys) to en.json, zh-TW.json, th.json, vi.json — covers email/password labels, buttons, links, and 12 error message variants
- All 4 locale files remain valid JSON with existing 'login' section untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix apiFetch 401 interceptor** and **Task 2: Add auth i18n keys** - `79c3a9e` (feat)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified
- `frontend/src/lib/api.ts` - Added AUTH_NO_REFRESH_PATHS constant and skipRefresh check before 401 refresh block
- `frontend/src/locales/en.json` - Added 'auth' section (21 keys): form labels, button text, link text, error messages
- `frontend/src/locales/zh-TW.json` - Traditional Chinese translations for auth section
- `frontend/src/locales/th.json` - Thai translations for auth section
- `frontend/src/locales/vi.json` - Vietnamese translations for auth section

## Decisions Made
- Tasks 1 and 2 were committed together in a single commit (79c3a9e) since they were both preparatory work for Plan 02 and naturally belong together as one unit

## Deviations from Plan
None - plan executed exactly as written. Both tasks were already complete from prior execution.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- apiFetch interceptor is correct — Plan 02 login/register pages can use apiFetch without risk of refresh loops on 401
- All i18n keys ready for Plan 02 components to use with `t('auth.*')` 
- No blockers

---
*Phase: 03-frontend-auth-ui*
*Completed: 2026-03-31*

## Self-Check: PASSED

- frontend/src/lib/api.ts: FOUND
- frontend/src/locales/en.json: FOUND
- frontend/src/locales/zh-TW.json: FOUND
- frontend/src/locales/th.json: FOUND
- frontend/src/locales/vi.json: FOUND
- .planning/phases/03-frontend-auth-ui/03-01-SUMMARY.md: FOUND
- Commit 79c3a9e: FOUND
