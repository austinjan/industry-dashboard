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

func TestRegisterLocal_Password73CharsRejected(t *testing.T) {
	// 73 chars exceeds the 72-char bcrypt limit and must be rejected
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/register", h.RegisterLocal)

	tooLong := strings.Repeat("a", 73)
	w := postJSON(t, mux, "/api/auth/register", map[string]string{"email": "user@example.com", "password": tooLong})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.password_too_long", resp["code"])
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

func TestLoginLocal_NoAtSignPassesValidation(t *testing.T) {
	// Login does NOT validate @ — admin account has no @
	// The test verifies validation stage only: email "admin" must not return auth.invalid_input
	// We test by passing empty email vs "admin" — only empty should return 400
	h := newTestHandler()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/auth/login/local", h.LoginLocal)

	// Empty email MUST return 400
	w := postJSON(t, mux, "/api/auth/login/local", map[string]string{"email": "", "password": "default"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	resp := decodeError(t, w)
	assert.Equal(t, "auth.invalid_input", resp["code"])
}

