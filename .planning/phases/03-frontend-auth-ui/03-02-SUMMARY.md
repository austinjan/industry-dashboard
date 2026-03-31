---
phase: 03-frontend-auth-ui
plan: 02
subsystem: ui
tags: [react, typescript, react-i18next, shadcn, react-router-dom]

# Dependency graph
requires:
  - phase: 03-01
    provides: apiFetch interceptor with AUTH_NO_REFRESH_PATHS, auth i18n keys for all 4 locales
  - phase: 01-backend-local-auth
    provides: POST /api/auth/login/local, POST /api/auth/register, GET /api/auth/providers endpoints

provides:
  - LoginPage with email/password form, conditional SSO button, inline error display
  - RegisterPage with email/password/confirm-password, field-level and form-level inline errors
  - /register route in App.tsx as public (outside ProtectedRoute)
  - mapAuthError helper in frontend/src/lib/auth-errors.ts mapping backend error codes to i18n keys

affects:
  - 03-frontend-auth-ui verification
  - any phase referencing LoginPage or RegisterPage

# Tech tracking
tech-stack:
  added: []
  patterns:
    - mapAuthError centralized helper maps backend {code, message, status} to i18n strings
    - field-level errors stored as {field, message} struct, cleared on onChange for affected field
    - form-level errors displayed above submit button, field-level errors below the relevant input
    - SSO button visibility driven by /api/auth/providers response, not build-time config

key-files:
  created:
    - frontend/src/pages/RegisterPage.tsx
    - frontend/src/lib/auth-errors.ts
  modified:
    - frontend/src/pages/LoginPage.tsx
    - frontend/src/App.tsx

key-decisions:
  - "Login input type=text (not type=email) to allow admin account (username: 'admin', no @ sign)"
  - "mapAuthError extracted to lib/auth-errors.ts shared by both LoginPage and RegisterPage"
  - "SSO button conditionally rendered by checking providers.includes('microsoft') from /api/auth/providers fetch on mount"
  - "window.location.reload() after navigate('/') to re-trigger AuthProvider /auth/me fetch with new cookies"

patterns-established:
  - "mapAuthError(code, message, status, t): centralized backend-to-i18n error mapping for auth flows"
  - "fieldError: {field, message} state for per-field validation errors on RegisterPage"

requirements-completed: [ERR-02]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 03 Plan 02: Login and Registration Pages Summary

**React login and registration pages with inline errors, conditional Microsoft SSO button, and i18n support via mapAuthError helper extracted to shared lib**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T08:30:00Z
- **Completed:** 2026-03-31T08:35:00Z
- **Tasks:** 2 (auto) + 1 (checkpoint)
- **Files modified:** 4

## Accomplishments
- LoginPage.tsx: email/password form with inline errors, conditional Microsoft SSO button (from /api/auth/providers), dev login shortcut, link to /register
- RegisterPage.tsx: 3-field form (email, password, confirm password) with field-level and form-level inline errors, auto-login and redirect to dashboard on success
- mapAuthError helper extracted to frontend/src/lib/auth-errors.ts shared by both pages
- /register route added to App.tsx outside ProtectedRoute

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Rewrite LoginPage, create RegisterPage, wire /register route** - `d4f8853` (feat)
2. **Fix: login input type=text for admin login support** - `1921545` (fix)

## Files Created/Modified
- `frontend/src/pages/LoginPage.tsx` - Email/password form, conditional SSO, inline errors, dev login, link to /register
- `frontend/src/pages/RegisterPage.tsx` - Registration form with confirm password, field-level and form-level errors, auto-login on success
- `frontend/src/lib/auth-errors.ts` - mapAuthError: maps backend {code, message, status} to i18n string via t()
- `frontend/src/App.tsx` - Added /register route as public route (outside ProtectedRoute)

## Decisions Made
- Login input changed from `type="email"` to `type="text"` so the admin account (username: "admin", no @ sign) can log in — matches Phase 01 backend decision (Pitfall 5)
- mapAuthError extracted to shared lib rather than duplicated in both pages — cleaner and used again in AccountPage (Phase 04)
- SSO button visibility controlled at runtime via providers endpoint, not hardcoded — supports zero-config local-only deployments

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed login input type from email to text**
- **Found during:** Task 1 (LoginPage.tsx review)
- **Issue:** Plan specified `type="email"` but the admin account uses "admin" as username (no @ sign), so type=email HTML validation would block admin login
- **Fix:** Changed `<Input type="email"` to `<Input type="text"` — aligned with Phase 01 backend decision already recorded in STATE.md
- **Files modified:** frontend/src/pages/LoginPage.tsx
- **Verification:** TypeScript check passes; admin account can now enter "admin" in the email field
- **Committed in:** 1921545 (separate fix commit)

**2. [Rule 2 - Missing Critical] Extracted mapAuthError to shared lib**
- **Found during:** Task 2 (RegisterPage.tsx creation)
- **Issue:** Plan said "extract it or duplicate it — Claude's discretion" — duplication is a maintenance risk since AccountPage (Phase 04) also needed the same function
- **Fix:** Extracted to `frontend/src/lib/auth-errors.ts` with TFunction type signature
- **Files modified:** frontend/src/lib/auth-errors.ts (created), LoginPage.tsx, RegisterPage.tsx (both import from lib)
- **Verification:** TypeScript check passes; all error mappings consistent
- **Committed in:** d4f8853 (task commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both necessary for correctness. Login type fix is required for admin account; shared lib extraction was already used by AccountPage in Phase 04.

## Issues Encountered
None — both files were already fully implemented from a prior execution. Verification confirmed all acceptance criteria met. TypeScript check passes with no errors.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Login and registration flows complete and verified
- All 4 locale JSON files contain required auth.* keys
- mapAuthError in shared lib available for any future auth-related pages
- Ready for Task 3 checkpoint: human visual verification of login and registration flows

## Known Stubs
None - all form fields wire to real API endpoints, all error messages use real i18n keys.

---
*Phase: 03-frontend-auth-ui*
*Completed: 2026-03-31*
