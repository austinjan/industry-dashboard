package user

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/industry-dashboard/server/internal/auth"
)

type LocaleUpdater interface {
	UpdateUserLocale(ctx context.Context, userID string, locale string) error
}

type PreferenceHandler struct {
	store LocaleUpdater
}

func NewPreferenceHandler(store LocaleUpdater) *PreferenceHandler {
	return &PreferenceHandler{store: store}
}

type updatePreferencesRequest struct {
	Locale string `json:"locale"`
}

func (h *PreferenceHandler) UpdatePreferences(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req updatePreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}

	if !ValidLocales[req.Locale] {
		http.Error(w, "invalid locale", http.StatusBadRequest)
		return
	}

	if err := h.store.UpdateUserLocale(r.Context(), claims.UserID, req.Locale); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"locale": req.Locale})
}
