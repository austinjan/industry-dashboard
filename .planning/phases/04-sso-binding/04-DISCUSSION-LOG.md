# Phase 4: SSO Binding - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-31
**Phase:** 04-sso-binding
**Areas discussed:** Bind Flow, Account Page, Conflict Handling, Unbind Policy
**Mode:** auto (all areas auto-selected, recommended defaults chosen)

---

## Bind Flow

| Option | Description | Selected |
|--------|-------------|----------|
| Separate bind endpoints | New `/api/auth/bind/microsoft` + `/api/auth/bind/callback` | ✓ |
| Reuse login callback with state flag | Same callback, different state prefix to distinguish | |
| Frontend-initiated token exchange | Frontend handles OIDC, sends token to backend | |

**User's choice:** [auto] Separate bind endpoints (recommended — cleanest separation of concerns)
**Notes:** Bind callback updates authenticated user's microsoft_id instead of upserting a new user. User ID comes from JWT cookie, not OIDC response.

---

## Account Page

| Option | Description | Selected |
|--------|-------------|----------|
| New /account page | Dedicated page from user menu in TopNav | ✓ |
| Settings modal | Modal overlay from user avatar | |
| Inline in existing page | Section added to an existing admin page | |

**User's choice:** [auto] New /account page (recommended — standard pattern, maps directly to SSO-02)
**Notes:** Shows auth method status, Link Microsoft button when OIDC configured and not yet linked. /auth/me extended with has_microsoft and registered_via fields.

---

## Conflict Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Clear error on duplicate | "This Microsoft account is already linked to another user" | ✓ |
| Silent transfer | Move microsoft_id from old user to new user | |
| Merge accounts | Combine both user records | |

**User's choice:** [auto] Clear error on duplicate (recommended — safe, leverages existing UNIQUE constraint)
**Notes:** nOAuth prevention locked from STATE.md — no auto-linking by email match.

---

## Unbind Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Defer to future | Not in SSO-01/SSO-02 requirements | ✓ |
| Include unlink button | Add unlink capability in this phase | |

**User's choice:** [auto] Defer to future (recommended — keep scope minimal)
**Notes:** Captured as deferred idea.

## Claude's Discretion

- Account page layout and styling
- Exact i18n key naming
- Whether to show additional user info beyond auth methods
- Whether to add unlink button (deferred)

## Deferred Ideas

- Unlink Microsoft account
- Change password from account page
- Account deletion/deactivation
