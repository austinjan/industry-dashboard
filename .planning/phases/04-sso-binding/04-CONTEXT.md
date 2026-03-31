# Phase 4: SSO Binding - Context

**Gathered:** 2026-03-31
**Status:** Ready for planning

<domain>
## Phase Boundary

Allow an authenticated local user to link their Microsoft Entra ID account from an account settings page. Show which auth methods are active (local password, Microsoft SSO). The bind action is user-initiated only — no silent auto-linking by email match. Record the bind action in the audit log.

</domain>

<decisions>
## Implementation Decisions

### Bind Flow
- **D-01:** Separate `/api/auth/bind/microsoft` endpoint initiates OIDC flow with a `bind`-prefixed state parameter. The user must be authenticated (JWT cookie present) when initiating the bind.
- **D-02:** Separate `/api/auth/bind/callback` handles the OIDC response. Instead of upserting a new user (like the login callback), it sets `microsoft_id` on the authenticated user's existing row.
- **D-03:** The bind callback extracts the user ID from the JWT cookie (not from the OIDC response) to determine which user to update. This enforces the "user-initiated while authenticated" requirement.
- **D-04:** On successful bind, redirect to `/account` with a success query param (e.g., `?bound=1`) that the frontend can use to show an inline success message.
- **D-05:** The bind action is recorded in the audit log (action: `sso_bind`, resource_type: `user`, details include the Microsoft email linked).

### Account Page
- **D-06:** New `/account` page accessible from the user avatar/dropdown in TopNav. Shows auth method status: local password set (yes/no), Microsoft linked (yes/no, with linked email if yes).
- **D-07:** "Link Microsoft Account" button visible only when `microsoft_id` is null AND OIDC is configured (providers includes "microsoft"). Clicking it navigates to `/api/auth/bind/microsoft`.
- **D-08:** The `/api/auth/me` response needs to include `microsoft_id` presence (boolean or the linked email) and `registered_via` so the frontend knows what to display. Add `has_microsoft: bool` and `registered_via: string` fields.

### Conflict Handling
- **D-09:** If the Microsoft identity (sub claim) is already linked to a different user, return a clear error: "This Microsoft account is already linked to another user." The existing UNIQUE constraint on `microsoft_id` handles this at the DB level — catch the unique violation and return a structured error.
- **D-10:** If a local user visits the login page with a Microsoft account whose email matches their local email, the login callback does NOT auto-link (nOAuth prevention — locked decision from STATE.md). The SSO login creates a separate user or the upsert path handles it as before. Binding is only via the account page.

### Claude's Discretion
- Whether to add an "Unlink Microsoft" button (not in SSO-01/SSO-02 — can defer)
- Account page layout and styling details
- Exact i18n key naming for account page strings
- Whether the account page shows additional user info beyond auth methods (name, email, role)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OIDC (existing)
- `internal/auth/oidc.go` — OIDCClient struct, AuthURL(), Exchange() methods — reuse for bind flow
- `internal/auth/handler.go` — Login(), Callback(), upsertUser() — reference for existing OIDC login flow; bind flow must NOT reuse upsertUser (different DB operation)

### Auth System
- `internal/auth/handler.go` — Me() handler needs extension to return `has_microsoft` and `registered_via`
- `internal/auth/middleware.go` — Auth middleware for JWT validation on bind endpoint
- `internal/auth/local.go` — RegisterLocal, LoginLocal — reference for password_hash column usage

### Database Schema
- `migrations/002_create_auth.up.sql` — users table: `microsoft_id VARCHAR(255) UNIQUE`, `password_hash VARCHAR(255)`
- `migrations/022_add_registered_via.up.sql` — `registered_via VARCHAR(20) NOT NULL DEFAULT 'microsoft'`

### Audit
- `internal/audit/middleware.go` — Audit middleware for recording the bind action

### Frontend Auth
- `frontend/src/lib/auth.tsx` — AuthProvider, useAuth hook, /auth/me fetch
- `frontend/src/lib/api.ts` — apiFetch with 401 interceptor (already fixed for auth endpoints)
- `frontend/src/components/layout/TopNav.tsx` — User menu/dropdown where "Account" link goes

### i18n
- `frontend/src/locales/{en,zh-TW,th,vi}.json` — All 4 locale files need account page strings
- `CLAUDE.md` §i18n — Adding new translatable strings procedure

### Error Handling
- `internal/apierr/apierr.go` — apierr.Write() for structured errors on bind endpoints

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `OIDCClient.AuthURL(state)` and `OIDCClient.Exchange(code)` — full OIDC flow reusable for bind, just need different state prefix and different callback handler
- `apierr.Write()` — structured error responses, use `sso.` prefix for bind-specific errors
- `auth.GetClaims(r.Context())` — extract authenticated user ID in bind callback
- shadcn/ui Card, Button, Label components — for account page layout
- `mapAuthError()` in `frontend/src/lib/auth-errors.ts` — extend for SSO bind error codes

### Established Patterns
- OIDC login uses state cookie for CSRF protection — bind flow should do the same
- Auth endpoints return `{code, message}` JSON errors — bind endpoints follow this
- All user-facing text uses `t('section.key')` pattern
- Audit middleware auto-logs mutating requests on protected routes

### Integration Points
- `cmd/server/main.go` — Add bind routes under the auth group (protected, require auth middleware)
- `frontend/src/App.tsx` — Add `/account` route (protected, inside AppShell)
- `frontend/src/components/layout/TopNav.tsx` — Add "Account" link to user dropdown
- `internal/auth/handler.go` — Extend Me() response with `has_microsoft` and `registered_via`

</code_context>

<specifics>
## Specific Ideas

- Bind flow reuses the same Azure AD app registration (same client ID, client secret) but needs a different redirect URL or uses the same one with state-based routing
- The `upsertUser` function should NOT be reused — bind is an UPDATE on an existing row, not an INSERT/upsert
- Consider using a different redirect URL (`/api/auth/bind/callback`) to cleanly separate login vs bind flows at the router level
- `has_microsoft` in /auth/me response is a boolean (don't leak the linked email to the frontend unless needed for display on account page — if needed, add `microsoft_email` field)

</specifics>

<deferred>
## Deferred Ideas

- Unlink Microsoft account — not in SSO-01/SSO-02, can be added in a future phase
- Change password from account page — separate feature
- Account deletion/deactivation — separate feature

</deferred>

---

*Phase: 04-sso-binding*
*Context gathered: 2026-03-31*
