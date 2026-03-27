package auth

import (
	"encoding/json"
	"net/http"
)

// apiError is the structured error shape {code, message} per STATE.md decision.
// RFC 7807 was explicitly rejected in favour of this simpler shape.
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// writeError writes a structured JSON error response.
func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(apiError{Code: code, Message: message})
}
