package apierr_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	chiMiddleware "github.com/go-chi/chi/v5/middleware"

	"github.com/industry-dashboard/server/internal/apierr"
)

type apiErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// wrapWithRequestID wraps a handler in the chi RequestID middleware so the
// request context contains a request ID that apierr.Write can read.
func wrapWithRequestID(h http.Handler) http.Handler {
	return chiMiddleware.RequestID(h)
}

func TestWrite_ContentType(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "", nil)
	})
	wrapWithRequestID(handler).ServeHTTP(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("expected Content-Type application/json, got %q", ct)
	}
}

func TestWrite_StatusCode(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apierr.Write(w, r, http.StatusForbidden, "rbac.forbidden", "Forbidden", "", nil)
	})
	wrapWithRequestID(handler).ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("expected status %d, got %d", http.StatusForbidden, w.Code)
	}
}

func TestWrite_JSONBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "user-123", nil)
	})
	wrapWithRequestID(handler).ServeHTTP(w, req)

	var body apiErrorBody
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response body: %v", err)
	}
	if body.Code != "auth.unauthorized" {
		t.Errorf("expected code auth.unauthorized, got %q", body.Code)
	}
	if body.Message != "Unauthorized" {
		t.Errorf("expected message Unauthorized, got %q", body.Message)
	}

	// Verify the body has exactly the right shape by re-encoding and checking keys
	var rawMap map[string]interface{}
	w2 := httptest.NewRecorder()
	handler.ServeHTTP(w2, req)
	if err := json.NewDecoder(w2.Body).Decode(&rawMap); err != nil {
		t.Fatalf("failed to decode raw body: %v", err)
	}
	if len(rawMap) != 2 {
		t.Errorf("expected exactly 2 fields in JSON body, got %d: %v", len(rawMap), rawMap)
	}
	if _, ok := rawMap["code"]; !ok {
		t.Error("missing 'code' field in JSON body")
	}
	if _, ok := rawMap["message"]; !ok {
		t.Error("missing 'message' field in JSON body")
	}
}

func TestWrite_SlogFields(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	origLogger := slog.Default()
	slog.SetDefault(logger)
	defer slog.SetDefault(origLogger)

	req := httptest.NewRequest(http.MethodPost, "/api/protected", nil)
	w := httptest.NewRecorder()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "user-abc", errors.New("token expired"))
	})
	wrapWithRequestID(handler).ServeHTTP(w, req)

	logOutput := buf.String()
	for _, field := range []string{"request_id", "user_id", "method", "path", "error_code", "error"} {
		if !strings.Contains(logOutput, field) {
			t.Errorf("slog output missing field %q; got: %s", field, logOutput)
		}
	}
}

func TestWrite_EmptyUserID(t *testing.T) {
	var buf bytes.Buffer
	logger := slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug}))
	origLogger := slog.Default()
	slog.SetDefault(logger)
	defer slog.SetDefault(origLogger)

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "", nil)
	})
	wrapWithRequestID(handler).ServeHTTP(w, req)

	logOutput := buf.String()
	// user_id field must appear even when empty
	if !strings.Contains(logOutput, "user_id") {
		t.Errorf("slog output missing user_id field when userID is empty; got: %s", logOutput)
	}
}

func TestWrite_NilError(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	// Must not panic when err is nil
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apierr.Write(w, r, http.StatusUnauthorized, "auth.unauthorized", "Unauthorized", "user-123", nil)
	})

	defer func() {
		if r := recover(); r != nil {
			t.Errorf("Write panicked with nil error: %v", r)
		}
	}()

	wrapWithRequestID(handler).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
