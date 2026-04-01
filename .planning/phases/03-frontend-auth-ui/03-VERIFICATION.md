---
phase: 03-frontend-auth-ui
verified: 2026-04-01T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Login page — wrong password shows inline error, not toast"
    expected: "Red inline text appears on the form below the password field area; no toast notification; no page redirect"
    why_human: "Error display is a visual/behavioral property — grep confirms text-destructive class is present and no toast import exists, but only a browser run confirms the error renders inline in context"
  - test: "Microsoft SSO button is absent when providers excludes microsoft"
    expected: "Running against a local-only backend, the SSO button and divider do not appear on the login page"
    why_human: "Conditional rendering depends on runtime API response from /api/auth/providers; cannot verify without a live server"
  - test: "Register new user lands on dashboard as guest"
    expected: "After filling the form with a fresh email and submitting, user is redirected to / and authenticated as guest role"
    why_human: "Requires a live database and backend to exercise the full registration flow"
  - test: "Language switch shows auth strings in zh-TW, th, and vi"
    expected: "Switching language in TopNav updates all form labels, button text, and any visible error messages on the login/register page"
    why_human: "i18n rendering depends on the language switcher wiring and react-i18next runtime behaviour"
---

# Phase 3: Frontend Auth UI Verification Report

**Phase Goal:** Users can register, log in, and see clear inline error messages in all four supported languages
**Verified:** 2026-04-01T00:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | apiFetch does not trigger refresh-token retry when login or register returns 401 | VERIFIED | `AUTH_NO_REFRESH_PATHS = ['/auth/login/local', '/auth/register']` + `skipRefresh` guard in `api.ts` lines 3 and 12-14 |
| 2 | All auth form labels and error messages have i18n keys in all 4 locales | VERIFIED | `"auth"` section with 21 keys confirmed present in `en.json`, `zh-TW.json`, `th.json`, `vi.json`; all files parse as valid JSON |
| 3 | Login page shows email/password form as primary method; SSO button conditional on providers response | VERIFIED | `LoginPage.tsx` fetches `/api/auth/providers` on mount; `providers.includes('microsoft')` gates the SSO block; form renders unconditionally |
| 4 | Wrong password shows inline error on the form — no toast, no redirect | VERIFIED (automated) | `text-destructive` paragraph inside form renders `error` state; no toast library imported; 401 from `apiFetch` skips refresh and falls through to `setError(mapAuthError(...))` |
| 5 | User can navigate to /register, fill form, and land on dashboard as guest | VERIFIED | `RegisterPage.tsx` exists at 143 lines; `/register` route in `App.tsx` line 56, outside `ProtectedRoute`; `navigate('/')` + `window.location.reload()` on `res.status === 201` |

**Score:** 5/5 truths verified (automated). Human verification needed for 4 runtime behaviours.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `frontend/src/lib/api.ts` | 401 interceptor with auth endpoint exemption | VERIFIED | 28 lines; `AUTH_NO_REFRESH_PATHS`, `skipRefresh`, and guarded refresh block all present |
| `frontend/src/locales/en.json` | English auth form and error i18n keys | VERIFIED | `"auth"` section at line 288, `auth.emailLabel = "Email"`, all 21 keys present |
| `frontend/src/locales/zh-TW.json` | Traditional Chinese auth translations | VERIFIED | `"auth"` section at line 287, `auth.emailLabel = "電子郵件"` |
| `frontend/src/locales/th.json` | Thai auth translations | VERIFIED | `"auth"` section at line 287, `auth.emailLabel = "อีเมล"` |
| `frontend/src/locales/vi.json` | Vietnamese auth translations | VERIFIED | `"auth"` section at line 287, `auth.emailLabel = "Email"` |
| `frontend/src/pages/LoginPage.tsx` | Form-based login page with inline errors | VERIFIED | 123 lines; `useTranslation`, `apiFetch`, `mapAuthError`, `text-destructive`, `providers.includes('microsoft')`, `Link to="/register"` all present |
| `frontend/src/pages/RegisterPage.tsx` | Registration page with confirm password | VERIFIED | 144 lines; `useTranslation`, `apiFetch`, `fieldError`, `confirmPassword`, field-level and form-level error display present |
| `frontend/src/App.tsx` | Route for /register | VERIFIED | Line 56: `<Route path="/register" element={<RegisterPage />} />` outside `ProtectedRoute` |
| `frontend/src/lib/auth-errors.ts` | Shared mapAuthError helper | VERIFIED | 16 lines; maps all 6 backend error codes plus HTTP 429 and fallback to i18n keys; imported by both LoginPage and RegisterPage |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `LoginPage.tsx` | `/api/auth/login/local` | `apiFetch` POST on form submit | VERIFIED | Line 35: `apiFetch('/auth/login/local', { method: 'POST', ... })` |
| `LoginPage.tsx` | `/api/auth/providers` | `fetch` in `useEffect` on mount | VERIFIED | Lines 22-27: plain `fetch('/api/auth/providers')` on mount, sets `providers` state |
| `RegisterPage.tsx` | `/api/auth/register` | `apiFetch` POST on form submit | VERIFIED | Line 51: `apiFetch('/auth/register', { method: 'POST', ... })` |
| `RegisterPage.tsx` | `/` | `navigate('/')` on successful registration | VERIFIED | Line 57: `navigate('/')` on `res.status === 201` |
| `App.tsx` | `RegisterPage.tsx` | Route element import | VERIFIED | Line 11: `import { RegisterPage } from '@/pages/RegisterPage'`; line 56: route element |
| `api.ts` | login/register pages | path check skipping refresh on auth endpoints | VERIFIED | `AUTH_NO_REFRESH_PATHS.some(p => path.startsWith(p))` covers both paths |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `LoginPage.tsx` | `error` | `mapAuthError(body.code, body.message, res.status, t)` from API response JSON | Yes — read from actual HTTP response body | FLOWING |
| `LoginPage.tsx` | `providers` | `fetch('/api/auth/providers')` → `.json()` → `data.providers` | Yes — runtime API call | FLOWING |
| `RegisterPage.tsx` | `fieldError` / `formError` | Client validation + `mapAuthError` from API response | Yes — real validation logic and API response | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `api.ts` exports `apiFetch` function | `node -e "const m = require('./dist/api.js')"` | SKIP — no built output | SKIP |
| TypeScript compiles with no errors | `npx tsc --noEmit` | Exit 0, no output | PASS |
| All 4 locale JSON files are valid | `node -e "JSON.parse(...)"` on all 4 files | "All JSON valid" | PASS |
| `AUTH_NO_REFRESH_PATHS` contains both auth paths | `grep "auth/login/local\|auth/register" api.ts` | Both paths found on line 3 | PASS |
| `/register` route is outside `ProtectedRoute` | Structural read of `App.tsx` | Route at line 56 is a sibling of `/login`, before the `ProtectedRoute` wrapper element | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ERR-02 | 03-01-PLAN.md, 03-02-PLAN.md | Frontend displays errors inline next to the relevant field or component | SATISFIED | `text-destructive` paragraphs in both `LoginPage.tsx` (form-level) and `RegisterPage.tsx` (field-level and form-level); no toast imports; `mapAuthError` maps backend codes to user-visible i18n strings |

No orphaned requirements — REQUIREMENTS.md maps ERR-02 to Phase 3, and both plans in this phase claim ERR-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `App.tsx` | 79 | `<div>Reports (coming soon)</div>` | Info | Unrelated stub route; pre-existing, outside scope of Phase 3 deliverables |

No anti-patterns in Phase 3 artifacts. The `/reports` stub is pre-existing and not introduced by this phase.

### Human Verification Required

#### 1. Wrong password shows inline error (not toast, not redirect)

**Test:** Start dev server (`make dev` + `cd frontend && npm run dev`). Visit http://localhost:5173/login. Submit the form with a valid-format email and a wrong password.
**Expected:** A red inline text message "Invalid email or password" appears on the form, below the password field and above the submit button. No toast notification. Page does not redirect.
**Why human:** The `text-destructive` class and `error` state are confirmed in code, but only a browser run confirms the visual layout is correct and no toast library fires.

#### 2. Microsoft SSO button absent on local-only backend

**Test:** With a backend that has no Azure/Entra ID configuration, visit http://localhost:5173/login.
**Expected:** The "Sign in with Microsoft" button and the divider ("or") do not appear. Only the email/password form is visible.
**Why human:** Conditional rendering depends on the runtime response from `/api/auth/providers`; cannot confirm without a live server returning `{"providers":["local"]}`.

#### 3. Register new user lands on dashboard as guest

**Test:** Visit http://localhost:5173/register. Fill in a fresh email address, a password, matching confirm password. Submit.
**Expected:** Redirect to `/` (dashboard) as an authenticated user with guest role. The TopNav shows the user's email and a logout link.
**Why human:** Requires a live database and backend to exercise the full registration and JWT issuance flow.

#### 4. Language switch updates auth form labels and errors

**Test:** Log in, switch language to zh-TW (or th or vi) via the TopNav dropdown. Log out. Return to `/login`.
**Expected:** Form label "Email" shows "電子郵件" (zh-TW) / "อีเมล" (th) / "Email" (vi). Submit with wrong credentials — error text appears in the selected language.
**Why human:** i18n rendering depends on the `react-i18next` runtime and language switcher wiring; locale JSON keys are confirmed present but rendering requires a browser.

### Gaps Summary

No gaps. All 5 observable truths are verified against the actual codebase. All 9 required artifacts exist, are substantive, and are wired. Data flows are confirmed (API responses populate error state; providers endpoint drives conditional rendering). TypeScript compiles cleanly. The 4 human verification items are runtime/visual confirmations of correct automated behaviour — none represent a blocking code deficiency.

---

_Verified: 2026-04-01T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
