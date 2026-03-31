package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/industry-dashboard/server/internal/apierr"
	"github.com/jackc/pgx/v5/pgconn"
)

// AuditLogger is a minimal interface for recording audit entries.
// Implemented by audit.Store in cmd/server/main.go via auditLoggerAdapter.
type AuditLogger interface {
	LogEntry(ctx context.Context, userID, action, resourceType, resourceID, ipAddress string, details map[string]interface{}) error
}

// BindMicrosoft initiates the Microsoft SSO bind flow for an authenticated user.
// The user must already be logged in (JWT cookie present). Generates a random state,
// stores it in an oauth_bind_state cookie (separate from oauth_state used in login),
// and redirects to Azure AD with the bind-specific redirect URL.
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
		MaxAge:   300,
	})
	http.Redirect(w, r, h.oidc.AuthURLWithRedirect(state, h.bindRedirectURL), http.StatusTemporaryRedirect)
}

// BindCallback handles the Azure AD callback for the bind flow.
// Validates the CSRF state cookie, exchanges the authorization code,
// updates the authenticated user's microsoft_id and microsoft_email,
// records an audit log entry, and redirects to /account?bound=1.
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
		apierr.Write(w, r, http.StatusBadRequest, "auth.invalid_input", "invalid state", claims.UserID, nil)
		return
	}
	// Clear bind state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_bind_state",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	oidcUser, err := h.oidc.ExchangeWithRedirect(r.Context(), r.URL.Query().Get("code"), h.bindRedirectURL)
	if err != nil {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "authentication failed", claims.UserID, err)
		return
	}
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
	// Audit log: record sso_bind with Microsoft email in details (D-05)
	// Uses goroutine to avoid blocking the redirect, but logs errors via slog
	if h.auditLogger != nil {
		go func() {
			if err := h.auditLogger.LogEntry(context.Background(), claims.UserID, "sso_bind", "user", claims.UserID,
				extractIP(r), map[string]interface{}{"microsoft_email": oidcUser.Email}); err != nil {
				slog.Error("audit log failed for sso_bind", "user_id", claims.UserID, "err", err)
			}
		}()
	}
	http.Redirect(w, r, "/account?bound=1", http.StatusTemporaryRedirect)
}

// extractIP returns the client IP address from the request, respecting X-Forwarded-For.
func extractIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		return strings.TrimSpace(strings.Split(forwarded, ",")[0])
	}
	if idx := strings.LastIndex(r.RemoteAddr, ":"); idx != -1 {
		return r.RemoteAddr[:idx]
	}
	return r.RemoteAddr
}
