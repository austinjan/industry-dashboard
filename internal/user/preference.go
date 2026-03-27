package user

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/industry-dashboard/server/internal/apierr"
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
		apierr.Write(w, r, http.StatusUnauthorized, "user.invalid_input", "unauthorized", "", nil)
		return
	}
	userID := claims.UserID

	var req updatePreferencesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apierr.Write(w, r, http.StatusBadRequest, "user.invalid_input", "invalid request", userID, nil)
		return
	}

	if !ValidLocales[req.Locale] {
		apierr.Write(w, r, http.StatusBadRequest, "user.invalid_input", "invalid locale", userID, nil)
		return
	}

	if err := h.store.UpdateUserLocale(r.Context(), claims.UserID, req.Locale); err != nil {
		apierr.Write(w, r, http.StatusInternalServerError, "internal", "internal error", userID, err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"locale": req.Locale})
}
