---
status: complete
phase: 04-sso-binding
source: 04-01-SUMMARY.md, 04-02-SUMMARY.md
started: 2026-03-31T08:00:00Z
updated: 2026-03-31T08:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server. Run `make migrate` then `make dev`. Server boots without errors, migration 023 (microsoft_email) completes. `curl http://localhost:8080/api/auth/providers` returns a JSON response listing available auth methods.
result: pass

### 2. Account Page Navigation
expected: Log in, then look at TopNav user area. There should be an "Account" link. Clicking it navigates to /account and loads the Account settings page.
result: pass

### 3. User Information Card
expected: On /account, a "User Information" card shows your email address, role, and registration method (e.g., "local" or "microsoft").
result: pass

### 4. Authentication Methods Status
expected: On /account, an "Authentication Methods" card shows which methods are active. For a local user: password is shown as set. Microsoft is shown as not linked (or linked if already bound).
result: pass

### 5. Microsoft Bind Button Visibility
expected: If Azure OIDC is configured (AZURE_CLIENT_ID set), the Account page shows a "Link Microsoft Account" button. If OIDC is not configured, the button does not appear.
result: pass

### 6. Bind Flow Redirect
expected: Clicking "Link Microsoft Account" performs a full-page redirect to Microsoft login (not SPA navigation). The URL goes to /api/auth/bind/microsoft which redirects to Azure AD.
result: blocked
blocked_by: server
reason: "Azure OIDC not configured in local environment — bind button not shown"

### 7. Bind Success Flow
expected: After completing Microsoft auth, you are redirected back to /account?bound=1. A green success message appears briefly. The Authentication Methods card now shows Microsoft as linked with the Microsoft email displayed. The ?bound=1 clears from the URL.
result: blocked
blocked_by: server
reason: "Azure OIDC not configured in local environment — cannot complete bind flow"

### 8. Extended /api/auth/me Response
expected: `curl` (or browser devtools) `/api/auth/me` returns JSON with `has_microsoft` (boolean), `registered_via` (string), and `microsoft_email` (string or null) fields in addition to existing user fields.
result: pass

### 9. SSO Bind Audit Log
expected: After a successful bind, the audit log contains an entry for the sso_bind action with the user ID and relevant details.
result: blocked
blocked_by: server
reason: "Azure OIDC not configured — cannot complete bind to verify audit entry"

### 10. Account Page i18n
expected: Switch language in TopNav to zh-TW, th, or vi. The Account page labels (card titles, button text, status labels) all render in the selected language — no untranslated English keys visible.
result: pass

## Summary

total: 10
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 3

## Gaps

[none]
