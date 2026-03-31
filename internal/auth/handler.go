package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"

	"github.com/industry-dashboard/server/internal/apierr"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	oidc            *OIDCClient
	jwt             *JWTService
	db              *pgxpool.Pool
	bindRedirectURL string
	auditLogger     AuditLogger
}

func NewHandler(oidc *OIDCClient, jwt *JWTService, db *pgxpool.Pool, bindRedirectURL string, auditLogger AuditLogger) *Handler {
	return &Handler{oidc: oidc, jwt: jwt, db: db, bindRedirectURL: bindRedirectURL, auditLogger: auditLogger}
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if h.oidc == nil {
		apierr.Write(w, r, http.StatusNotImplemented, "auth.sso_not_configured", "SSO is not configured", "", nil)
		return
	}
	state := generateState()
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, h.oidc.AuthURL(state), http.StatusTemporaryRedirect)
}

func (h *Handler) Callback(w http.ResponseWriter, r *http.Request) {
	if h.oidc == nil {
		apierr.Write(w, r, http.StatusNotImplemented, "auth.sso_not_configured", "SSO is not configured", "", nil)
		return
	}
	cookie, err := r.Cookie("oauth_state")
	if err != nil || cookie.Value != r.URL.Query().Get("state") {
		apierr.Write(w, r, http.StatusBadRequest, "auth.invalid_input", "invalid state", "", nil)
		return
	}
	oidcUser, err := h.oidc.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "authentication failed", "", err)
		return
	}
	user, err := h.upsertUser(r.Context(), oidcUser)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to provision user", "", err)
		return
	}
	accessToken, err := h.jwt.CreateAccessToken(user.ID, user.Email)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to create token", user.ID, err)
		return
	}
	refreshToken, err := h.jwt.CreateRefreshToken(user.ID, user.Email)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to create token", user.ID, err)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    accessToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   900,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   604800,
	})
	http.Redirect(w, r, "/", http.StatusTemporaryRedirect)
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil || cookie.Value == "" {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "no refresh token", "", nil)
		return
	}

	claims, err := h.jwt.ValidateToken(cookie.Value)
	if err != nil || claims.TokenType != "refresh" {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "invalid refresh token", "", err)
		return
	}
	accessToken, err := h.jwt.CreateAccessToken(claims.UserID, claims.Email)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to create token", claims.UserID, err)
		return
	}
	refreshToken, err := h.jwt.CreateRefreshToken(claims.UserID, claims.Email)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "failed to create token", claims.UserID, err)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    accessToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   900,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		Path:     "/api/auth",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   604800,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/api/auth",
		HttpOnly: true,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims := GetClaims(r.Context())
	if claims == nil {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "unauthorized", "", nil)
		return
	}
	var user struct {
		ID             string  `json:"id"`
		Email          string  `json:"email"`
		Name           string  `json:"name"`
		Locale         *string `json:"locale"`
		HasMicrosoft   bool    `json:"has_microsoft"`
		RegisteredVia  string  `json:"registered_via"`
		MicrosoftEmail *string `json:"microsoft_email"`
	}
	err := h.db.QueryRow(r.Context(),
		`SELECT id, email, name, locale,
		        microsoft_id IS NOT NULL AS has_microsoft,
		        registered_via,
		        microsoft_email
		 FROM users WHERE id = $1`, claims.UserID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Locale,
		&user.HasMicrosoft, &user.RegisteredVia, &user.MicrosoftEmail)
	if err != nil {
		apierr.Write(w, r, http.StatusNotFound, "auth.invalid_input", "user not found", claims.UserID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

type dbUser struct {
	ID    string
	Email string
}

func (h *Handler) upsertUser(ctx context.Context, oidcUser *OIDCUser) (*dbUser, error) {
	var user dbUser
	err := h.db.QueryRow(ctx,
		`INSERT INTO users (email, name, microsoft_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (microsoft_id) DO UPDATE SET
		   email = EXCLUDED.email,
		   name = EXCLUDED.name,
		   updated_at = NOW()
		 RETURNING id, email`,
		oidcUser.Email, oidcUser.Name, oidcUser.MicrosoftID,
	).Scan(&user.ID, &user.Email)
	return &user, err
}

func generateState() string {
	b := make([]byte, 32)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}

// Providers returns the list of available auth methods.
// Always includes "local". Includes "microsoft" only when Azure OIDC is configured.
func (h *Handler) Providers(w http.ResponseWriter, r *http.Request) {
	providers := []string{"local"}
	if h.oidc != nil {
		providers = append(providers, "microsoft")
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"providers": providers,
	})
}

// SeedDefaultAdmin creates a default admin account if the users table is empty (first-run only).
// email: "admin", password: "default", Admin role with global scope.
// Called during server startup before the handler is fully wired.
func SeedDefaultAdmin(ctx context.Context, db *pgxpool.Pool) {
	var count int
	err := db.QueryRow(ctx, "SELECT COUNT(*) FROM users").Scan(&count)
	if err != nil {
		log.Printf("Warning: could not check user count for admin seed: %v", err)
		return
	}
	if count > 0 {
		return // not first run — per D-08
	}
	hash, err := HashPassword("default")
	if err != nil {
		log.Printf("Warning: could not hash default admin password: %v", err)
		return
	}
	var adminID string
	err = db.QueryRow(ctx,
		`INSERT INTO users (email, name, password_hash, registered_via, is_active)
		 VALUES ('admin', 'Administrator', $1, 'local', true)
		 RETURNING id`, hash).Scan(&adminID)
	if err != nil {
		log.Printf("Warning: could not create default admin: %v", err)
		return
	}
	var adminRoleID string
	err = db.QueryRow(ctx, `SELECT id FROM roles WHERE name='Admin'`).Scan(&adminRoleID)
	if err != nil {
		log.Printf("Warning: Admin role not found, skipping role assignment: %v", err)
		return
	}
	_, err = db.Exec(ctx,
		`INSERT INTO user_site_roles (user_id, role_id, site_id)
		 VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING`, adminID, adminRoleID)
	if err != nil {
		log.Printf("Warning: could not assign Admin role: %v", err)
		return
	}
	log.Println("Default admin created (email: admin, password: default) -- CHANGE IMMEDIATELY")
}
