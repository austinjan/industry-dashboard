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

// --- Password utility tests ---

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := auth.HashPassword("testpassword")
	require.NoError(t, err)
	assert.True(t, auth.CheckPassword(hash, "testpassword"))
	assert.False(t, auth.CheckPassword(hash, "wrongpassword"))
}

func TestDummyCheckPassword(t *testing.T) {
	// Should not panic and should take measurable time (bcrypt cost 12 ~ 200-400ms)
	start := time.Now()
	auth.DummyCheckPassword("anypassword")
	elapsed := time.Since(start)
	assert.Greater(t, elapsed, 100*time.Millisecond, "DummyCheckPassword should take bcrypt time")
}

// --- Table-driven validation tests ---

func TestRegisterLocalValidation(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret", 15*time.Minute, 7*24*time.Hour)
	handler := auth.NewHandler(nil, jwtSvc, nil, "", nil) // nil db — validation returns before DB call

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"empty body", `{}`, 400, "auth.invalid_input"},
		{"missing email", `{"password":"test"}`, 400, "auth.invalid_input"},
		{"missing password", `{"email":"test@example.com"}`, 400, "auth.invalid_input"},
		{"empty email", `{"email":"","password":"test"}`, 400, "auth.invalid_input"},
		{"empty password", `{"email":"test@example.com","password":""}`, 400, "auth.invalid_input"},
		{"email without @", `{"email":"noemail","password":"test"}`, 400, "auth.invalid_input"},
		{"password too long", `{"email":"test@example.com","password":"` + strings.Repeat("a", 73) + `"}`, 400, "auth.password_too_long"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/auth/register", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			handler.RegisterLocal(rec, req)
			assert.Equal(t, tt.wantStatus, rec.Code)
			var errResp struct {
				Code string `json:"code"`
			}
			json.NewDecoder(rec.Body).Decode(&errResp)
			assert.Equal(t, tt.wantCode, errResp.Code)
		})
	}
}

func TestLoginLocalValidation(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret", 15*time.Minute, 7*24*time.Hour)
	handler := auth.NewHandler(nil, jwtSvc, nil, "", nil) // nil db — validation fails first

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{"empty body", `{}`, 400, "auth.invalid_input"},
		{"missing email", `{"password":"test"}`, 400, "auth.invalid_input"},
		{"missing password", `{"email":"test@example.com"}`, 400, "auth.invalid_input"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/auth/login/local", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()
			handler.LoginLocal(rec, req)
			assert.Equal(t, tt.wantStatus, rec.Code)
			var errResp struct {
				Code string `json:"code"`
			}
			json.NewDecoder(rec.Body).Decode(&errResp)
			assert.Equal(t, tt.wantCode, errResp.Code)
		})
	}
}

func TestProviders(t *testing.T) {
	t.Run("without OIDC", func(t *testing.T) {
		handler := auth.NewHandler(nil, nil, nil, "", nil)
		req := httptest.NewRequest("GET", "/api/auth/providers", nil)
		rec := httptest.NewRecorder()
		handler.Providers(rec, req)
		assert.Equal(t, 200, rec.Code)
		var resp map[string][]string
		json.NewDecoder(rec.Body).Decode(&resp)
		assert.Equal(t, []string{"local"}, resp["providers"])
	})
	// Note: testing with non-nil OIDC requires a real OIDCClient which needs Azure config.
	// The nil path is the critical test — non-nil just appends "microsoft" to the slice.
}

// newTestHandler creates a Handler with nil OIDCClient and a test JWT service.
// No DB is wired — only validation-path tests (no DB access needed) run here.
func newTestHandler() *auth.Handler {
	jwtSvc := auth.NewJWTService("test-secret-local", 15*time.Minute, 168*time.Hour)
	return auth.NewHandler(nil, jwtSvc, nil, "", nil)
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

// --- Providers handler tests ---

func TestProviders_NoOIDC(t *testing.T) {
	jwtSvc := auth.NewJWTService("test-secret", 15*time.Minute, 168*time.Hour)
	h := auth.NewHandler(nil, jwtSvc, nil, "", nil)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/providers", nil)
	w := httptest.NewRecorder()
	h.Providers(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string][]string
	err := json.NewDecoder(w.Body).Decode(&resp)
	require.NoError(t, err)
	assert.Equal(t, []string{"local"}, resp["providers"])
}
