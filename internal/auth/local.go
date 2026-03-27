package auth

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"
)

// RegisterLocal handles POST /api/auth/register.
// Creates a new local account with email/password and returns JWT cookies.
// Per D-01: display name derived from email prefix.
// Per D-02: bcrypt cost 12.
// Per D-03: SSO-linked email shows linked message.
// Per D-04, D-05: Viewer role assigned globally on registration.
func (h *Handler) RegisterLocal(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "auth.invalid_input", "Invalid request body")
		return
	}

	// Validate inputs
	if req.Email == "" || !strings.Contains(req.Email, "@") {
		writeError(w, http.StatusBadRequest, "auth.invalid_input", "Valid email is required")
		return
	}
	if req.Password == "" {
		writeError(w, http.StatusBadRequest, "auth.invalid_input", "Password is required")
		return
	}
	if len(req.Password) > 72 {
		writeError(w, http.StatusBadRequest, "auth.password_too_long", "Password must be 72 characters or fewer")
		return
	}

	// Derive display name from email prefix per D-01
	displayName := strings.Split(req.Email, "@")[0]

	// Hash password
	hash, err := HashPassword(req.Password)
	if err != nil {
		log.Printf("RegisterLocal: failed to hash password: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "Failed to process registration")
		return
	}

	// Insert user
	var userID string
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO users (email, name, password_hash, registered_via)
		 VALUES ($1, $2, $3, 'local')
		 RETURNING id`,
		req.Email, displayName, hash,
	).Scan(&userID)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			// Unique violation — email taken. Check if it's an SSO account.
			var microsoftID *string
			_ = h.db.QueryRow(r.Context(),
				`SELECT microsoft_id FROM users WHERE email=$1`, req.Email,
			).Scan(&microsoftID)
			if microsoftID != nil {
				writeError(w, http.StatusConflict, "auth.email_taken",
					"Email already in use. Log in via SSO to link your account.")
			} else {
				writeError(w, http.StatusConflict, "auth.email_taken", "Email already registered")
			}
			return
		}
		log.Printf("RegisterLocal: failed to insert user: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "Failed to create account")
		return
	}

	// Assign Viewer role with global scope (site_id = NULL) per D-04, D-05
	var viewerRoleID string
	err = h.db.QueryRow(r.Context(),
		`SELECT id FROM roles WHERE name='Viewer'`,
	).Scan(&viewerRoleID)
	if err != nil {
		log.Printf("RegisterLocal: Viewer role not found: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "System misconfigured")
		return
	}
	_, err = h.db.Exec(r.Context(),
		`INSERT INTO user_site_roles (user_id, role_id, site_id) VALUES ($1, $2, NULL)`,
		userID, viewerRoleID,
	)
	if err != nil {
		log.Printf("RegisterLocal: failed to assign Viewer role: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "Failed to assign role")
		return
	}

	// Create JWT tokens and set cookies
	if err := h.setAuthCookies(w, userID, req.Email); err != nil {
		log.Printf("RegisterLocal: failed to set auth cookies: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "Failed to create session")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{
		"id":    userID,
		"email": req.Email,
		"name":  displayName,
	})
}

// LoginLocal handles POST /api/auth/login/local.
// Authenticates with email and password, returns JWT cookies.
// Per STATE.md: DummyCheckPassword on not-found path prevents timing-based enumeration.
// Per Pitfall 5: NO email format validation (admin account has no @).
func (h *Handler) LoginLocal(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "auth.invalid_input", "Invalid request body")
		return
	}

	// Validate inputs — no @ check per Pitfall 5 (admin has no @)
	if req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "auth.invalid_input", "Email and password required")
		return
	}

	// Query user
	var (
		userID       string
		email        string
		name         string
		passwordHash *string
		isActive     bool
	)
	err := h.db.QueryRow(r.Context(),
		`SELECT id, email, name, password_hash, is_active FROM users WHERE email=$1`,
		req.Email,
	).Scan(&userID, &email, &name, &passwordHash, &isActive)
	if err != nil {
		// User not found — run dummy check for timing safety
		DummyCheckPassword(req.Password)
		writeError(w, http.StatusUnauthorized, "auth.invalid_credentials", "Invalid email or password")
		return
	}

	// SSO-only user (no password set)
	if passwordHash == nil {
		DummyCheckPassword(req.Password)
		writeError(w, http.StatusUnauthorized, "auth.invalid_credentials", "Invalid email or password")
		return
	}

	// Verify password
	if !CheckPassword(*passwordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "auth.invalid_credentials", "Invalid email or password")
		return
	}

	// Check account status AFTER password check (don't reveal disabled status to unauthenticated users)
	if !isActive {
		writeError(w, http.StatusForbidden, "auth.account_disabled", "Account is disabled")
		return
	}

	// Create JWT tokens and set cookies
	if err := h.setAuthCookies(w, userID, email); err != nil {
		log.Printf("LoginLocal: failed to set auth cookies: %v", err)
		writeError(w, http.StatusInternalServerError, "internal", "Failed to create session")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"id":    userID,
		"email": email,
		"name":  name,
	})
}

// setAuthCookies creates access and refresh JWT tokens and sets them as HttpOnly cookies.
// Cookie pattern matches handler.go Callback exactly.
func (h *Handler) setAuthCookies(w http.ResponseWriter, userID, email string) error {
	accessToken, err := h.jwt.CreateAccessToken(userID, email)
	if err != nil {
		return err
	}
	refreshToken, err := h.jwt.CreateRefreshToken(userID, email)
	if err != nil {
		return err
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
	return nil
}
