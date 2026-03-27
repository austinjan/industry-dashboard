# Phase 3: Frontend Auth UI - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver frontend login and registration pages wired to the Phase 1 backend auth endpoints, with inline error display parsing the Phase 2 structured `{code, message}` JSON responses. All new UI strings must appear in all 4 locales (EN, zh-TW, th, vi). Fix the apiFetch 401 interceptor so login failures don't trigger token refresh loops.

</domain>

<decisions>
## Implementation Decisions

### Login Page Layout
- **D-01:** Single page with email/password form as the primary login method. The Microsoft SSO button ("Sign in with Microsoft") appears below the form only when the `/api/auth/providers` endpoint includes "microsoft" in the response.
- **D-02:** The existing LoginPage.tsx is replaced entirely — current implementation is SSO-only with a link tag, new version needs a proper form with state management.
- **D-03:** Dev login button remains in development mode only (`import.meta.env.DEV`).

### Registration Flow
- **D-04:** Link from login page: "Don't have an account? Register" navigates to `/register`.
- **D-05:** Registration form fields: email, password, confirm password. Display name is derived from email prefix on the backend (Phase 1 decision D-01).
- **D-06:** On successful registration: auto-login (backend sets JWT cookies on register response), redirect to dashboard. No confirmation step (no email verification exists).
- **D-07:** Link from register page: "Already have an account? Log in" navigates back to `/login`.

### Inline Error Display (ERR-02)
- **D-08:** Field-level errors appear as red text directly below the input field that triggered the error (e.g., "Email already in use" below the email field).
- **D-09:** Form-level errors (rate limiting, network errors, unexpected server errors) appear above the submit button in a styled error block.
- **D-10:** Errors clear when the user starts typing in the affected field.
- **D-11:** No toast notifications — inline only (locked decision from STATE.md).
- **D-12:** Error messages are translatable — map backend error codes to i18n keys (e.g., `auth.email_taken` → `t('error.emailTaken')`).

### 401 Interceptor Fix
- **D-13:** apiFetch must NOT trigger the refresh-token retry for auth endpoints. A 401 from `/auth/login/local` or `/auth/register` is a credential error, not an expired token. Use path-based check to skip refresh on these endpoints.

### Claude's Discretion
- Form validation approach (controlled components vs react-hook-form vs native validation)
- Password visibility toggle (show/hide button on password fields)
- Loading states during form submission (spinner, disabled button, etc.)
- Exact error code → i18n key mapping structure
- Whether to create a shared form error component or keep it inline

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Frontend Auth (existing)
- `frontend/src/pages/LoginPage.tsx` — Current SSO-only login page (to be replaced)
- `frontend/src/lib/auth.tsx` — AuthProvider, useAuth hook, logout flow, locale restoration
- `frontend/src/lib/api.ts` — apiFetch with 401 refresh interceptor (needs fix for login endpoints)
- `frontend/src/App.tsx` — Route definitions, AuthProvider wrapping

### Backend Auth Endpoints (Phase 1)
- `internal/auth/local.go` — POST /api/auth/login/local, POST /api/auth/register (request/response shapes, error codes)
- `internal/auth/handler.go` — GET /api/auth/providers (dynamic provider list)

### Error Shape (Phase 2)
- `internal/apierr/apierr.go` — Shared error writer: `{code, message}` JSON shape

### i18n
- `frontend/src/locales/en.json` — English locale (has login section, needs auth error keys)
- `frontend/src/locales/zh-TW.json` — Traditional Chinese locale
- `frontend/src/locales/th.json` — Thai locale
- `frontend/src/locales/vi.json` — Vietnamese locale
- `frontend/src/lib/i18n.ts` — i18n configuration
- `CLAUDE.md` §i18n — Adding new translatable strings procedure

### UI Components
- `frontend/src/components/ui/` — shadcn/ui components (button, badge, tabs — check for Input, Label, Card)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuthProvider` + `useAuth()` — handles session state, logout, locale restore — fully reusable, no changes needed
- `apiFetch()` — HTTP client with credential inclusion — needs targeted fix for auth endpoint 401s
- shadcn/ui `Button` component with variants (default, outline) — already used in LoginPage
- `useTranslation()` hook from react-i18next — established pattern throughout the app
- `buttonVariants()` utility for link-styled buttons

### Established Patterns
- Pages are in `frontend/src/pages/` — new RegisterPage.tsx goes here
- Routes defined in `App.tsx` with react-router-dom
- All user-facing text uses `t('section.key')` pattern
- Components use Tailwind CSS classes directly (no CSS modules)
- Layout: centered card pattern for login (flex h-screen items-center justify-center)

### Integration Points
- `App.tsx` — add `/register` route
- `LoginPage.tsx` — replace entirely with form-based login
- `api.ts` — modify apiFetch to skip refresh on auth endpoints
- All 4 locale JSON files — add login form labels, register labels, error messages

</code_context>

<specifics>
## Specific Ideas

- User said "up to you" for all areas — Claude has full discretion on implementation details
- Must respect Phase 1 decision: no password complexity rules (no client-side validation beyond "required")
- Confirm password field on registration is a UX addition (backend doesn't enforce it)
- The `/api/auth/providers` response determines whether to show Microsoft SSO button

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-frontend-auth-ui*
*Context gathered: 2026-03-27*
