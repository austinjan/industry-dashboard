# Phase 3: Frontend Auth UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 03-frontend-auth-ui
**Areas discussed:** Login page layout, Registration flow, Inline error display, 401 interceptor fix

---

## Login Page Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Single form + conditional SSO | Email/password form as primary, Microsoft button below when available | ✓ |
| Tab switching | Tabs for "Local" and "Microsoft" login methods | |
| Side-by-side | Two columns: local form and SSO button | |

**User's choice:** "up to you" — Claude selected single form with conditional SSO
**Notes:** Simplest approach, matches industrial dashboard aesthetic. No need for tabs with only 2 providers.

---

## Registration Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-login on register | Register → set cookies → redirect to dashboard | ✓ |
| Register then manual login | Register → show success → redirect to login page | |

**User's choice:** "up to you" — Claude selected auto-login
**Notes:** No email verification exists, so no reason to force a separate login step. Form fields: email, password, confirm password.

---

## Inline Error Display

| Option | Description | Selected |
|--------|-------------|----------|
| Field-level + form-level | Red text below affected field; form-level errors above submit | ✓ |
| Form-level only | Single error block at top of form | |

**User's choice:** "up to you" — Claude selected field-level + form-level
**Notes:** Matches ERR-02 requirement for inline display. Error codes mapped to i18n keys for translation.

---

## 401 Interceptor Fix

| Option | Description | Selected |
|--------|-------------|----------|
| Path-based skip | Don't retry refresh for /auth/login/local and /auth/register | ✓ |
| Response code-based | Check error code in response body before retrying | |

**User's choice:** "up to you" — Claude selected path-based skip
**Notes:** Simpler, no need to parse response body. Login 401 = bad credentials, not expired token.

---

## Claude's Discretion

- All four areas: user deferred all decisions to Claude
- Form validation approach, password toggle, loading states, error mapping structure

## Deferred Ideas

None
