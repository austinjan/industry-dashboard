package llmauth

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/apierr"
	"github.com/industry-dashboard/server/internal/auth"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

// CreateKey handles POST requests to create a new API key.
func (h *Handler) CreateKey(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "llm.invalid_input", "invalid request body", userID, nil)
		return
	}
	if req.Name == "" {
		apierr.Write(w, r, http.StatusBadRequest, "llm.invalid_input", "name is required", userID, nil)
		return
	}

	key, fullKey, err := h.store.Create(r.Context(), req.Name)
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}

	resp := struct {
		*APIKey
		FullKey string `json:"full_key"`
		Warning string `json:"warning"`
	}{
		APIKey:  key,
		FullKey: fullKey,
		Warning: "Store this key securely. It will not be shown again.",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// ListKeys handles GET requests to list all API keys.
func (h *Handler) ListKeys(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	keys, err := h.store.List(r.Context())
	if err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

// RevokeKey handles DELETE requests to revoke an API key.
func (h *Handler) RevokeKey(w http.ResponseWriter, r *http.Request) {
	userID := ""
	if claims := auth.GetClaims(r.Context()); claims != nil {
		userID = claims.UserID
	}
	keyID := chi.URLParam(r, "keyID")
	if keyID == "" {
		apierr.Write(w, r, http.StatusBadRequest, "llm.invalid_input", "keyID is required", userID, nil)
		return
	}

	if err := h.store.Revoke(r.Context(), keyID); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
