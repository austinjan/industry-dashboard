package auth_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/industry-dashboard/server/internal/auth"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// newTestHandler creates a Handler with nil OIDCClient and a test JWT service.
// No DB is wired — only validation-path tests (no DB access needed) run here.
func newTestHandler() *auth.Handler {
	jwtSvc := auth.NewJWTService("test-secret-local", 15*time.Minute, 168*time.Hour)
	return auth.NewHandler(nil, jwtSvc, nil)
}

func postJSON(t *testing.T, h http.Handler, path string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	require.NoError(t, err)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

// Helper to decode error response
func decodeError(t *testing.T, w *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	var out map[string]string
	err := json.NewDecoder(w.Body).Decode(&out)
	require.NoError(t, err)
	return out
}

// --- RegisterLocal validation tests (no DB required) ---

func TestRegisterLocal_EmptyEmail(t *testing.T) {
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", h.RegisterLocal)

	w := postJSON(t, mux, "/api/auth/register", map[string]string{"email": "", "password": "password123"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.invalid_input", resp["code"])
}

func TestRegisterLocal_EmptyPassword(t *testing.T) {
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", h.RegisterLocal)

	w := postJSON(t, mux, "/api/auth/register", map[string]string{"email": "user@example.com", "password": ""})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.invalid_input", resp["code"])
}

func TestRegisterLocal_MissingAtSign(t *testing.T) {
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", h.RegisterLocal)

	w := postJSON(t, mux, "/api/auth/register", map[string]string{"email": "notanemail", "password": "password123"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.invalid_input", resp["code"])
}

func TestRegisterLocal_PasswordTooLong(t *testing.T) {
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", h.RegisterLocal)

	longPwd := strings.Repeat("a", 73)
	w := postJSON(t, mux, "/api/auth/register", map[string]string{"email": "user@example.com", "password": longPwd})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.password_too_long", resp["code"])
}

func TestRegisterLocal_Password72CharsOK(t *testing.T) {
	// 72 chars is exactly the limit — should not be rejected at validation stage
	// (will fail on DB insert since no DB, but we're testing the validation only)
	// We can't easily test this without a DB, but we can verify 72 chars doesn't get "password_too_long"
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", h.RegisterLocal)

	exactPwd := strings.Repeat("a", 72)
	w := postJSON(t, mux, "/api/auth/register", map[string]string{"email": "user@example.com", "password": exactPwd})
	// Should NOT return password_too_long — will likely fail with 500 (no DB) or succeed
	if w.Code == http.StatusBadRequest {
		resp := decodeError(t, w)
		assert.NotEqual(t, "auth.password_too_long", resp["code"], "72-char password should not be rejected as too long")
	}
}

// --- LoginLocal validation tests (no DB required) ---

func TestLoginLocal_EmptyEmail(t *testing.T) {
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login/local", h.LoginLocal)

	w := postJSON(t, mux, "/api/auth/login/local", map[string]string{"email": "", "password": "password123"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.invalid_input", resp["code"])
}

func TestLoginLocal_EmptyPassword(t *testing.T) {
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login/local", h.LoginLocal)

	w := postJSON(t, mux, "/api/auth/login/local", map[string]string{"email": "user@example.com", "password": ""})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.invalid_input", resp["code"])
}

func TestLoginLocal_NoAtSignIsAllowed(t *testing.T) {
	// Login does NOT validate @ — admin account has no @
	// Without DB, will not reach auth check, but should not reject at validation
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login/local", h.LoginLocal)

	w := postJSON(t, mux, "/api/auth/login/local", map[string]string{"email": "admin", "password": "default"})
	// Should NOT return auth.invalid_input — without DB it may return 500, but NOT 400
	assert.NotEqual(t, http.StatusBadRequest, w.Code, "LoginLocal should not reject email without @ at validation stage")
}

// --- Providers handler tests ---

func TestProviders_NoOIDC(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	h := auth.NewHandler(nil, jwtSvc, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/providers", nil)
	w := httptest.NewRecorder()
	h.Providers(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string][]string
	err := json.NewDecoder(w.Body).Decode(&resp)
	require.NoError(t, err)
	assert.Equal(t, []string{"local"}, resp["providers"])
}
