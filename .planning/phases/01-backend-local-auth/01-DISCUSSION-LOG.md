# Phase 1: Backend Local Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 01-backend-local-auth
**Areas discussed:** Registration flow, Guest role permissions, Providers endpoint

---

## Registration Flow

### Registration Fields

| Option | Description | Selected |
|--------|-------------|----------|
| Email + password only | Simplest — display name derived from email prefix, can be edited later | ✓ |
| Email + password + display name | User sets their name at registration time | |
| Email + password + name + company | Collect more context upfront for admin review | |

**User's choice:** Email + password only
**Notes:** None

### Password Requirements

| Option | Description | Selected |
|--------|-------------|----------|
| Minimum 8 chars only | Simple length check — no complexity rules | |
| 8+ chars with mix required | Must include uppercase, lowercase, and number | |
| You decide | Claude picks a reasonable default | |

**User's choice:** "不用設限" (no restrictions at all)
**Notes:** User explicitly wants no password requirements whatsoever

### Email Clash with SSO Account

| Option | Description | Selected |
|--------|-------------|----------|
| Block registration | Return error: 'email already in use' — user must log in via SSO then link | |
| Allow, create separate account | Two accounts can share the same email — SSO binding merges later | |
| You decide | Claude picks the safer approach | ✓ |

**User's choice:** You decide
**Notes:** Claude will block registration for safety (nOAuth prevention)

---

## Guest Role Permissions

### Role for New Registrations

| Option | Description | Selected |
|--------|-------------|----------|
| Same as Viewer | dashboard:view, machine:view, datapoint:view, alert:view — read-only access | |
| Less than Viewer | Only dashboard:view — can see dashboards but no machine/data/alert access | |
| Nothing until assigned | No permissions — can log in but sees empty state until admin grants a role | |

**User's choice:** "forget guest, use viewer" — no new Guest role, use existing Viewer role
**Notes:** Simplifies implementation — no migration needed for a new role

### Viewer Role Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Global (no site scope) | Viewer on all sites — site_id NULL in user_site_roles. Admin can restrict later. | ✓ |
| No site at all | Viewer role assigned but no site access — admin must assign sites before user sees data | |

**User's choice:** Global (no site scope)
**Notes:** None

---

## Providers Endpoint

### GET /api/auth/providers Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Always return both | Always list local + microsoft. Frontend shows/hides Microsoft button based on presence. | |
| Dynamic based on config | Only include 'microsoft' when Azure env vars are configured. Local always present. | |
| You decide | Claude picks the practical approach | ✓ |

**User's choice:** You decide
**Notes:** Claude will use dynamic based on config — prevents broken SSO button

---

## Additional Decisions (raised by user)

### Default Admin Account

| Option | Description | Selected |
|--------|-------------|----------|
| Migration seed | Always inserted by migration — consistent, same pattern as role seeds | |
| First-run only | Server checks if users table is empty on startup, creates admin if so | ✓ |

**User's choice:** First-run only
**Notes:** email=admin, password=default. Won't recreate if deleted.

---

## Claude's Discretion

- Login endpoint design (request/response shape)
- Dummy bcrypt on not-found path
- Structured errors for new endpoints
- Rate limiting details (httprate)

## Deferred Ideas

None
