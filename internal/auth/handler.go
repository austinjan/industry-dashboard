package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	oidc *OIDCClient
	jwt  *JWTService
	db   *pgxpool.Pool
}

func NewHandler(oidc *OIDCClient, jwt *JWTService, db *pgxpool.Pool) *Handler {
	return &Handler{oidc: oidc, jwt: jwt, db: db}
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
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
	cookie, err := r.Cookie("oauth_state")
	if err != nil || cookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}
	oidcUser, err := h.oidc.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "authentication failed", http.StatusUnauthorized)
		return
	}
	user, err := h.upsertUser(r.Context(), oidcUser)
	if err != nil {
		http.Error(w, "failed to provision user", http.StatusInternalServerError)
		return
	}
	accessToken, err := h.jwt.CreateAccessToken(user.ID, user.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}
	refreshToken, err := h.jwt.CreateRefreshToken(user.ID, user.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
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
		http.Error(w, "no refresh token", http.StatusUnauthorized)
		return
	}

	claims, err := h.jwt.ValidateToken(cookie.Value)
	if err != nil || claims.TokenType != "refresh" {
		http.Error(w, "invalid refresh token", http.StatusUnauthorized)
		return
	}
	accessToken, err := h.jwt.CreateAccessToken(claims.UserID, claims.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
		return
	}
	refreshToken, err := h.jwt.CreateRefreshToken(claims.UserID, claims.Email)
	if err != nil {
		http.Error(w, "failed to create token", http.StatusInternalServerError)
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
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var user struct {
		ID     string  `json:"id"`
		Email  string  `json:"email"`
		Name   string  `json:"name"`
		Locale *string `json:"locale"`
	}
	err := h.db.QueryRow(r.Context(),
		"SELECT id, email, name, locale FROM users WHERE id = $1", claims.UserID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Locale)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
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
