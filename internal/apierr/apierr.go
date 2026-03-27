// Package apierr provides a shared error writer that combines structured JSON
// HTTP responses with slog logging. All API handlers should use Write() to
// return errors so that every error carries a request_id, user_id, and
// machine-parseable error code.
package apierr

import (
	"encoding/json"
	"log/slog"
	"net/http"

	chiMiddleware "github.com/go-chi/chi/v5/middleware"
)

// apiError is the JSON body returned to clients for all error responses.
// Shape: {"code": "...", "message": "..."}
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Write logs the error via slog and writes a structured JSON error response to w.
//
// Parameters:
//   - w        — the http.ResponseWriter to write the response to
//   - r        — the incoming request (used for request_id, method, path)
//   - status   — the HTTP status code (e.g. http.StatusUnauthorized)
//   - code     — machine-readable error code (e.g. "auth.unauthorized")
//   - message  — human-readable error message sent to the client
//   - userID   — the authenticated user's ID; pass "" when user is not known
//   - err      — the underlying error for logging; may be nil for client errors
func Write(w http.ResponseWriter, r *http.Request, status int, code, message, userID string, err error) {
	slog.Error("api error",
		"request_id", chiMiddleware.GetReqID(r.Context()),
		"user_id", userID,
		"method", r.Method,
		"path", r.URL.Path,
		"error_code", code,
		"error", err,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(apiError{Code: code, Message: message})
}
