# Phase 4: SSO Binding - Research

**Researched:** 2026-03-31
**Domain:** OIDC bind flow (Go), account page UI (React/TypeScript), audit logging
**Confidence:** HIGH

## Summary

Phase 4 adds SSO account linking on top of the existing OIDC infrastructure. The bind flow reuses `OIDCClient.AuthURL()` and `OIDCClient.Exchange()` without change. The only new backend work is: two new HTTP handlers (`BindMicrosoft`, `BindCallback`) added to `internal/auth/handler.go`, an extension of `Me()` to return `has_microsoft` and `registered_via`, a DB UPDATE query (not upsert), and CSRF state-cookie handling mirroring the existing login flow.

On the frontend: a new `/account` route inside `AppShell`, a link in `TopNav` user menu, extension of the `User` interface in `auth.tsx`, and `mapAuthError` additions in `auth-errors.ts`. All user-facing strings must be added to all four locale files.

The entire feature fits cleanly into existing patterns. No new packages are required on either side.

**Primary recommendation:** Implement bind as parallel handlers to login/callback inside `internal/auth/handler.go`, using a `bind_` state prefix to distinguish the CSRF cookie value, and a separate `oauth_bind_state` cookie name to avoid collision with in-progress login flows.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Separate `/api/auth/bind/microsoft` endpoint initiates OIDC flow with a `bind`-prefixed state parameter. The user must be authenticated (JWT cookie present) when initiating the bind.
- **D-02:** Separate `/api/auth/bind/callback` handles the OIDC response. Instead of upserting a new user (like the login callback), it sets `microsoft_id` on the authenticated user's existing row.
- **D-03:** The bind callback extracts the user ID from the JWT cookie (not from the OIDC response) to determine which user to update. This enforces the "user-initiated while authenticated" requirement.
- **D-04:** On successful bind, redirect to `/account` with a success query param (e.g., `?bound=1`) that the frontend can use to show an inline success message.
- **D-05:** The bind action is recorded in the audit log (action: `sso_bind`, resource_type: `user`, details include the Microsoft email linked).
- **D-06:** New `/account` page accessible from the user avatar/dropdown in TopNav. Shows auth method status: local password set (yes/no), Microsoft linked (yes/no, with linked email if yes).
- **D-07:** "Link Microsoft Account" button visible only when `microsoft_id` is null AND OIDC is configured (providers includes "microsoft"). Clicking it navigates to `/api/auth/bind/microsoft`.
- **D-08:** The `/api/auth/me` response needs to include `has_microsoft: bool` and `registered_via: string`.
- **D-09:** If the Microsoft identity (sub claim) is already linked to a different user, return a clear error: "This Microsoft account is already linked to another user." The existing UNIQUE constraint on `microsoft_id` handles this at the DB level — catch the unique violation and return a structured error.
- **D-10:** No auto-link by email match (nOAuth prevention). Binding is only via the account page while authenticated.

### Claude's Discretion

- Whether to add an "Unlink Microsoft" button (not in SSO-01/SSO-02 — can defer)
- Account page layout and styling details
- Exact i18n key naming for account page strings
- Whether the account page shows additional user info beyond auth methods (name, email, role)

### Deferred Ideas (OUT OF SCOPE)

- Unlink Microsoft account — not in SSO-01/SSO-02, can be added in a future phase
- Change password from account page — separate feature
- Account deletion/deactivation — separate feature
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SSO-01 | Authenticated user can link their Microsoft Entra ID from an account page | Bind flow via `/api/auth/bind/microsoft` + `/api/auth/bind/callback`; reuses OIDCClient; DB UPDATE on `microsoft_id`; audit log entry |
| SSO-02 | Account page shows login status (local password set, Microsoft SSO linked or not) | `/api/auth/me` extended with `has_microsoft` + `registered_via`; new `/account` page in React; `User` interface extended in `auth.tsx` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `github.com/coreos/go-oidc/v3` | already in go.mod | OIDC token exchange and verification | Already used for login flow; reuse without change |
| `golang.org/x/oauth2` | already in go.mod | OAuth2 auth code URL + exchange | Same as above |
| `github.com/jackc/pgx/v5` | already in go.mod | DB UPDATE for microsoft_id | Already the project DB driver |
| `react-router-dom` | already in package.json | `/account` route | Already the project router |
| `react-i18next` | already in package.json | All UI strings | Project-mandated i18n |
| shadcn/ui Card, Button, Badge | already in project | Account page layout | Established component library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@tanstack/react-query` | already in project | Invalidating `/auth/me` cache after bind | Use `queryClient.invalidateQueries(['me'])` or reload user state after redirect |

**Installation:** No new packages required on either side.

---

## Architecture Patterns

### Recommended Project Structure

New files:
```
internal/auth/bind.go                          # BindMicrosoft + BindCallback handlers
frontend/src/pages/AccountPage.tsx             # /account route
```

Modified files:
```
internal/auth/handler.go                       # Me() extended; no upsert reuse
cmd/server/main.go                             # Add bind routes
frontend/src/lib/auth.tsx                      # User interface extended
frontend/src/lib/auth-errors.ts                # New sso.* error codes
frontend/src/components/layout/TopNav.tsx      # "Account" link in user menu
frontend/src/App.tsx                           # /account route registration
frontend/src/locales/{en,zh-TW,th,vi}.json    # account.* i18n keys
```

### Pattern 1: Bind Initiation Handler

**What:** Requires authenticated user (JWT cookie must be valid). Generates a random state, stores it in a separate `oauth_bind_state` cookie (not `oauth_state` — avoids collision with concurrent login), and redirects to `OIDCClient.AuthURL(state)`.

**When to use:** `GET /api/auth/bind/microsoft`

```go
// internal/auth/bind.go
func (h *Handler) BindMicrosoft(w http.ResponseWriter, r *http.Request) {
    if h.oidc == nil {
        apierr.Write(w, r, http.StatusNotImplemented, "auth.sso_not_configured", "SSO is not configured", "", nil)
        return
    }
    claims := GetClaims(r.Context())
    if claims == nil {
        apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "", nil)
        return
    }
    state := generateState()
    http.SetCookie(w, &http.Cookie{
        Name:     "oauth_bind_state",
        Value:    state,
        Path:     "/",
        HttpOnly: true,
        SameSite: http.SameSiteLaxMode,
        MaxAge:   300, // 5 minutes
    })
    http.Redirect(w, r, h.oidc.AuthURL(state), http.StatusTemporaryRedirect)
}
```

**Why separate cookie name:** If a user has two tabs open — one starting a login and one starting a bind — sharing `oauth_state` would cause one to invalidate the other. `oauth_bind_state` isolates them.

### Pattern 2: Bind Callback Handler

**What:** Validates state cookie, exchanges code for OIDCUser, reads authenticated user ID from JWT claims (D-03), executes `UPDATE users SET microsoft_id = $1 WHERE id = $2`, catches unique violation (error code `23505`) for "already linked to another user". Clears the bind state cookie on success.

```go
func (h *Handler) BindCallback(w http.ResponseWriter, r *http.Request) {
    if h.oidc == nil {
        apierr.Write(w, r, http.StatusNotImplemented, "auth.sso_not_configured", "SSO is not configured", "", nil)
        return
    }
    claims := GetClaims(r.Context())
    if claims == nil {
        apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "", nil)
        return
    }
    cookie, err := r.Cookie("oauth_bind_state")
    if err != nil || cookie.Value != r.URL.Query().Get("state") {
        apierr.Write(w, r, http.StatusBadRequest, "auth.invalid_input", "invalid state", "", nil)
        return
    }
    // Clear bind state cookie
    http.SetCookie(w, &http.Cookie{
        Name: "oauth_bind_state", Value: "", Path: "/", HttpOnly: true, MaxAge: -1,
    })
    oidcUser, err := h.oidc.Exchange(r.Context(), r.URL.Query().Get("code"))
    if err != nil {
        apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "authentication failed", claims.UserID, err)
        return
    }
    _, err = h.db.Exec(r.Context(),
        `UPDATE users SET microsoft_id = $1 WHERE id = $2`,
        oidcUser.MicrosoftID, claims.UserID,
    )
    if err != nil {
        var pgErr *pgconn.PgError
        if errors.As(err, &pgErr) && pgErr.Code == "23505" {
            apierr.Write(w, r, http.StatusConflict, "sso.already_linked",
                "This Microsoft account is already linked to another user.", claims.UserID, nil)
            return
        }
        apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to link account", claims.UserID, err)
        return
    }
    // Audit log entry is recorded by the audit middleware registered on the route
    http.Redirect(w, r, "/account?bound=1", http.StatusTemporaryRedirect)
}
```

### Pattern 3: Audit Logging for Bind

**What:** The audit middleware (`auditMW.Log`) captures request body as `details`. For a GET redirect handler, the body is empty. Instead of relying on request-body capture, add a direct audit log call inside BindCallback after the successful UPDATE, using the Microsoft email as the detail.

**Two options:**

Option A — Inject `audit.Logger` into `authHandler` and call `logger.Log()` directly after the successful UPDATE. This gives richer `details` (the linked Microsoft email). Requires adding `auditStore` to `auth.Handler`.

Option B — Register the callback route with `auditMW.Log("user", "sso_bind")` but accept that the details map will be empty (since GET has no body).

**Recommendation:** Option A. The audit entry is only meaningful with the Microsoft email in `details`. The handler already has context, user ID, and `oidcUser.Email` available at that point. Add `audit.Logger` as a dependency to `Handler` (or pass it in `NewHandler`).

### Pattern 4: Me() Extension

**What:** Query `microsoft_id IS NOT NULL AS has_microsoft` and `registered_via` alongside existing fields.

```go
// in handler.go Me()
var user struct {
    ID             string  `json:"id"`
    Email          string  `json:"email"`
    Name           string  `json:"name"`
    Locale         *string `json:"locale"`
    HasMicrosoft   bool    `json:"has_microsoft"`
    RegisteredVia  string  `json:"registered_via"`
}
err := h.db.QueryRow(r.Context(),
    `SELECT id, email, name, locale,
            microsoft_id IS NOT NULL AS has_microsoft,
            registered_via
     FROM users WHERE id = $1`, claims.UserID,
).Scan(&user.ID, &user.Email, &user.Name, &user.Locale, &user.HasMicrosoft, &user.RegisteredVia)
```

### Pattern 5: Route Registration in main.go

**What:** Bind routes must be inside the auth group AND require auth middleware. They are separate from the public auth routes.

```go
// in main.go, inside r.Route("/api/auth", ...)
// Bind routes (protected — user must be authenticated)
r.With(authMW.Authenticate).Get("/bind/microsoft", authHandler.BindMicrosoft)
r.With(authMW.Authenticate).Get("/bind/callback", authHandler.BindCallback)
```

Note: No separate Azure AD redirect URL registration is strictly required if `/api/auth/bind/callback` is added to the app's Redirect URIs in the Azure portal. The `OIDCClient` currently uses a single `RedirectURL` from config (`AZURE_REDIRECT_URL`). A new config key `AZURE_BIND_REDIRECT_URL` is needed, OR the bind flow reuses the same `RedirectURL` with state-based routing.

**Recommended approach (config key):** Add `AzureBindRedirectURL string` to `config.Config`. Create a second `OIDCClient` instance in `main.go` with the bind redirect URL, or instantiate `OIDCClient` with the bind URL in `NewHandler` / pass the bind URL through `AuthURL`. See Pitfall 2 below.

**Simpler approach (one client, two redirect URLs is invalid):** Azure requires each redirect URL to be explicitly registered. The simplest path is: add `AZURE_BIND_REDIRECT_URL` env var, register it in Azure, and construct a second `OIDCClient` or override just the redirect URL in `oauth2.Config`.

### Pattern 6: Account Page Frontend

**What:** New `AccountPage.tsx` under `frontend/src/pages/`. Uses `useAuth()` for current user data, reads `user.has_microsoft` and `user.registered_via`. Checks `?bound=1` query param with `useSearchParams` to show inline success message. Checks providers list for `"microsoft"` to conditionally show the "Link Microsoft Account" button.

```tsx
// frontend/src/pages/AccountPage.tsx (skeleton)
import { useAuth } from '@/lib/auth';
import { useSearchParams } from 'react-router-dom';

export function AccountPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const justBound = searchParams.get('bound') === '1';
  // ... render Card with auth method status rows
  // ... "Link Microsoft Account" button: href="/api/auth/bind/microsoft" when !user.has_microsoft && providers.includes('microsoft')
}
```

### Anti-Patterns to Avoid

- **Reusing `upsertUser()`:** That function does an INSERT ON CONFLICT UPDATE. For bind, it must be a plain UPDATE on an existing row — reusing upsert would allow upsert to create a new user if the microsoft_id is new.
- **Using `oauth_state` cookie for bind:** Collides with in-progress login flow. Use `oauth_bind_state`.
- **Silent auto-link by email match:** Locked decision D-10. Never check email in the bind callback to find the target user — always use the authenticated user's ID from JWT claims.
- **Leaking microsoft_id string:** Expose only `has_microsoft: bool` from the Me endpoint unless a visible `microsoft_email` field is explicitly desired for the account page display.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OIDC token exchange + verification | Custom HTTP token exchange | `OIDCClient.Exchange()` already in codebase | Already verifies id_token signature, extracts sub/email/name |
| CSRF protection for OAuth flow | Custom nonce/session store | State cookie pattern (already in `Login()`) | Stateless, HttpOnly, SameSite=Lax — sufficient for CSRF |
| pgx unique violation detection | Parsing error strings | `errors.As(err, &pgErr) && pgErr.Code == "23505"` | Already used in `RegisterLocal` — copy the pattern |
| Error response format | Custom error JSON | `apierr.Write()` | Ensures slog logging + consistent `{code, message}` shape |

---

## Common Pitfalls

### Pitfall 1: Bind Callback Missing Auth Middleware
**What goes wrong:** `/api/auth/bind/callback` is registered without `authMW.Authenticate`, so `GetClaims(r.Context())` returns nil, and the handler falls back to an unauthenticated path.
**Why it happens:** Azure redirects to the callback with only the `code` and `state` query params — no Authorization header. The JWT cookie IS present, but only if the middleware is wired.
**How to avoid:** Register the bind callback with `r.With(authMW.Authenticate).Get("/bind/callback", ...)`.
**Warning signs:** `GetClaims` returning nil in BindCallback; 401 responses during bind.

### Pitfall 2: Single OIDCClient with Login's RedirectURL
**What goes wrong:** `OIDCClient.oauth2Config.RedirectURL` is set to `AZURE_REDIRECT_URL` (`/api/auth/callback`). When the bind flow calls `AuthURL()`, Azure will redirect to the login callback, not the bind callback.
**Why it happens:** `AuthURL()` uses the `RedirectURL` baked into `oauth2.Config` at construction time.
**How to avoid:** Either (a) construct a second `OIDCClient` with `AZURE_BIND_REDIRECT_URL`, or (b) add a `AuthURLWithRedirect(state, redirectURL string) string` method that overrides the redirect URL per call via `oauth2.Config.AuthCodeURL(state, oauth2.SetAuthURLParam("redirect_uri", redirectURL))`. Option (b) keeps one client but adds a method.
**Warning signs:** After completing OIDC flow, the callback lands at `/api/auth/callback` (login), not `/api/auth/bind/callback`. The login callback then calls `upsertUser` — this would create a duplicate account or overwrite the existing one.

### Pitfall 3: Audit Middleware Captures Empty Details for GET Handlers
**What goes wrong:** `auditMW.Log` reads `r.Body` for POST/PUT/PATCH but skips GET (`r.Method != http.MethodGet`). The bind callback is a GET (Azure redirect). The audit entry is created with `details = nil`.
**Why it happens:** See `audit/middleware.go` line 28: body capture skips GET.
**How to avoid:** Inject `audit.Logger` into `Handler` and call `logger.Log()` directly with the constructed details map after the successful UPDATE (D-05 requires Microsoft email in details).
**Warning signs:** Audit log entries for `sso_bind` show empty details JSON.

### Pitfall 4: `?bound=1` Param Persists in URL After Page Reload
**What goes wrong:** User navigates away from `/account?bound=1` and returns via browser back — success message reappears.
**Why it happens:** The query param is permanent until navigated away.
**How to avoid:** After reading `?bound=1`, replace the URL history entry with `replace` navigation: `navigate('/account', { replace: true })` after showing the message. Or use a one-time state effect.

### Pitfall 5: `registered_via` Column DEFAULT Is 'microsoft'
**What goes wrong:** The migration `022_add_registered_via.up.sql` sets `DEFAULT 'microsoft'`. Local users registered via `RegisterLocal` set `registered_via = 'local'` explicitly. The account page logic checking `registered_via === 'local'` to show "password set" is correct only if the value was correctly written. SSO-only users will have `registered_via = 'microsoft'` and `password_hash = NULL`.
**Why it happens:** Migration default is 'microsoft' — all pre-migration SSO users are correctly classified. Local users always have the explicit 'local' value. No ambiguity.
**How to avoid:** The account page should use BOTH conditions for "local password set" check: `registered_via === 'local'` (sufficient, since local registration always sets this). Alternatively use `has_password_hash` if that field is exposed. Sticking with `registered_via` is fine per the existing design.

### Pitfall 6: `microsoft_email` Not Returned by Me() — Account Page Shows Only True/False
**What goes wrong:** The account page (D-06) should display the linked Microsoft email if linked. `has_microsoft: bool` alone doesn't let the UI show the email address.
**Why it happens:** D-08 specifies `has_microsoft: bool` but notes "if needed, add `microsoft_email` field".
**How to avoid:** Add `microsoft_email *string` (nullable) to the Me() response: `SELECT microsoft_id IS NOT NULL, microsoft_id, registered_via`. Note: `microsoft_id` is the Azure AD `sub` claim (an opaque ID), NOT the email. To show a linked email, either (a) store `microsoft_email` in a separate column, or (b) use the `email` field from the users table (which equals the Microsoft email for SSO users). For local users who bind a Microsoft account whose email differs from their local email, the user's `email` column stays as their local email. Showing `user.email` as the "linked Microsoft account" is misleading. **Resolution:** Add a `microsoft_email VARCHAR(255)` column in a migration, set it during BindCallback from `oidcUser.Email`.

---

## Code Examples

### DB UPDATE for bind (with unique-violation catch)
```go
// Source: pattern from internal/auth/local.go RegisterLocal
_, err = h.db.Exec(r.Context(),
    `UPDATE users SET microsoft_id = $1, microsoft_email = $2 WHERE id = $3`,
    oidcUser.MicrosoftID, oidcUser.Email, claims.UserID,
)
if err != nil {
    var pgErr *pgconn.PgError
    if errors.As(err, &pgErr) && pgErr.Code == "23505" {
        apierr.Write(w, r, http.StatusConflict, "sso.already_linked",
            "This Microsoft account is already linked to another user.", claims.UserID, nil)
        return
    }
    apierr.Write(w, r, http.StatusInternalServerError, "internal",
        "failed to link account", claims.UserID, err)
    return
}
```

### AuthURLWithRedirect override (Option B for single OIDCClient)
```go
// internal/auth/oidc.go — add method
func (c *OIDCClient) AuthURLWithRedirect(state, redirectURL string) string {
    return c.oauth2Config.AuthCodeURL(state, oauth2.SetAuthURLParam("redirect_uri", redirectURL))
}
```

### Frontend: reading ?bound=1 and clearing it
```tsx
// Source: react-router-dom useSearchParams pattern
const [searchParams] = useSearchParams();
const navigate = useNavigate();
const justBound = searchParams.get('bound') === '1';

useEffect(() => {
  if (justBound) {
    // Remove query param from URL without triggering navigation
    navigate('/account', { replace: true });
  }
}, [justBound, navigate]);
```

### User interface extension in auth.tsx
```typescript
interface User {
  id: string;
  email: string;
  name: string;
  locale?: string | null;
  has_microsoft: boolean;
  registered_via: string;
  microsoft_email?: string | null;  // present if has_microsoft === true
}
```

### mapAuthError addition in auth-errors.ts
```typescript
case 'sso.already_linked': return t('account.errorAlreadyLinked');
case 'auth.sso_not_configured': return t('account.errorSsoNotConfigured');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single redirect URL per OIDC app | Multiple redirect URIs per app registration | Azure AD supports this since initial release | Bind callback can use a distinct URL |
| Auto-link by email (nOAuth pattern) | User-initiated bind only | Security hardening | Prevents account takeover; already locked in STATE.md |

---

## Database Schema Impact

### Migration required: add microsoft_email column

The `users` table currently has `microsoft_id VARCHAR(255) UNIQUE` but no `microsoft_email` column. To display which Microsoft account is linked on the account page, a new column is needed.

```sql
-- migrations/023_add_microsoft_email.up.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_email VARCHAR(255);
```

```sql
-- migrations/023_add_microsoft_email.down.sql
ALTER TABLE users DROP COLUMN IF EXISTS microsoft_email;
```

The BindCallback writes both `microsoft_id` (the Azure sub claim, opaque) and `microsoft_email` (the human-readable linked email). The Me() endpoint returns `microsoft_email` as a nullable string.

**Alternative:** Skip the column and show `user.email` as the linked identity display. This is incorrect for users whose local email differs from their Microsoft email. The migration is the right call.

---

## Azure AD App Registration Note

The existing `AZURE_REDIRECT_URL` env var points to `/api/auth/callback`. The bind callback at `/api/auth/bind/callback` is a new redirect URI that must be added to the Azure AD app registration's "Redirect URIs" list. This is a manual config step in the Azure portal — it is not code.

Two approaches for the OIDCClient:

**Approach A (recommended): second OIDCClient for bind**
- Add `AZURE_BIND_REDIRECT_URL` env var (defaults to `http://localhost:8080/api/auth/bind/callback`)
- Add `AzureBindRedirectURL string` to `config.Config`
- Construct `bindOIDCClient` in `main.go` with the bind redirect URL
- Pass `bindOIDCClient` to `authHandler` (add field to `Handler` struct)

**Approach B: single client with per-call redirect override**
- Add `AuthURLWithRedirect()` method to `OIDCClient`
- In `BindMicrosoft`, call `h.oidc.AuthURLWithRedirect(state, bindRedirectURL)`
- In `BindCallback`, pass `redirect_uri` override to `Exchange()`

Approach A is cleaner for readability. Approach B avoids a second client but requires changing `Exchange()` signature.

**Config addition for either approach:**
```go
// internal/config/config.go
AzureBindRedirectURL string
// default: "http://localhost:8080/api/auth/bind/callback"
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase is purely code/config changes. External dependencies (Azure AD, PostgreSQL) are already in use by Phase 1-3 infrastructure.

---

## Open Questions

1. **AuthURLWithRedirect vs second OIDCClient**
   - What we know: Both approaches work; the bind callback is a new redirect URI in Azure
   - What's unclear: Whether the planner prefers to minimise struct changes (approach B) or configuration explicitness (approach A)
   - Recommendation: Approach A (second OIDCClient) — maps cleanly to a config key and avoids method signature changes

2. **microsoft_email column: add now or use email column**
   - What we know: `microsoft_id` is an opaque Azure sub claim — useless for display. The `email` column may differ for local users who bind a different Microsoft account.
   - What's unclear: Whether any users in practice will have mismatching local vs Microsoft emails
   - Recommendation: Add `microsoft_email` column (migration 023) — costs one extra column, prevents incorrect UI display. The BindCallback always writes it from `oidcUser.Email`.

3. **Audit detail injection: dependency on audit.Logger**
   - What we know: Adding `audit.Logger` to `auth.Handler` creates a cross-package dependency (auth imports audit). Currently audit imports auth for `GetClaims`.
   - What's unclear: Whether this creates a circular import. In `audit/middleware.go`, `audit` imports `auth`. If `auth` imports `audit`, that is circular.
   - Recommendation: Pass `audit.Logger` as an interface (not the concrete type) to `auth.Handler`, OR use a different approach: have BindCallback return a special response type that main.go's route registration wraps with the audit middleware using a POST redirect instead, OR skip direct logging and use a different audit pattern. **Most pragmatic:** Define a minimal `AuditLogger` interface in the `auth` package (one `Log(ctx, entry)` method), implement it with `audit.Store` in `cmd/server/main.go` via an adapter. This avoids the circular import entirely.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `internal/auth/oidc.go`, `internal/auth/handler.go`, `internal/auth/local.go`, `internal/auth/middleware.go`, `internal/audit/middleware.go`, `internal/apierr/apierr.go`, `cmd/server/main.go`
- Direct schema inspection: `migrations/002_create_auth.up.sql`, `migrations/022_add_registered_via.up.sql`
- Direct frontend inspection: `frontend/src/lib/auth.tsx`, `frontend/src/lib/auth-errors.ts`, `frontend/src/lib/hooks.ts`, `frontend/src/App.tsx`, `frontend/src/components/layout/TopNav.tsx`
- CONTEXT.md decisions D-01 through D-10

### Secondary (MEDIUM confidence)
- Azure AD OIDC: multiple redirect URIs supported per app registration (standard Azure AD feature, well-documented)
- pgx v5 unique violation code `23505`: confirmed in existing `RegisterLocal` usage in codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reuse confirmed by code inspection
- Architecture: HIGH — bind flow structure derived directly from existing login flow + CONTEXT.md decisions
- Pitfalls: HIGH — Pitfalls 1-4 derived from code reading; Pitfall 5-6 from schema inspection
- DB schema impact: HIGH — `microsoft_id` is opaque sub claim confirmed in `oidc.go`; `microsoft_email` gap identified by comparing schema to account page display needs

**Research date:** 2026-03-31
**Valid until:** 2026-05-01 (stable stack; Azure AD OIDC library not fast-moving)
