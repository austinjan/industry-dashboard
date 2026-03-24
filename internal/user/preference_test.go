package user

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"context"

	"github.com/industry-dashboard/server/internal/auth"
)

type mockPreferenceStore struct {
	locale    *string
	updateErr error
}

func (m *mockPreferenceStore) UpdateUserLocale(ctx context.Context, userID string, locale string) error {
	if m.updateErr != nil {
		return m.updateErr
	}
	if !ValidLocales[locale] {
		return fmt.Errorf("invalid locale: %s", locale)
	}
	m.locale = &locale
	return nil
}

func TestUpdatePreferences_ValidLocale(t *testing.T) {
	store := &mockPreferenceStore{}
	handler := NewPreferenceHandler(store)

	body, _ := json.Marshal(map[string]string{"locale": "zh-TW"})
	req := httptest.NewRequest("PATCH", "/api/me/preferences", bytes.NewReader(body))
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))

	w := httptest.NewRecorder()
	handler.UpdatePreferences(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if store.locale == nil || *store.locale != "zh-TW" {
		t.Errorf("expected locale zh-TW, got %v", store.locale)
	}
}

func TestUpdatePreferences_InvalidLocale(t *testing.T) {
	store := &mockPreferenceStore{}
	handler := NewPreferenceHandler(store)

	body, _ := json.Marshal(map[string]string{"locale": "fr"})
	req := httptest.NewRequest("PATCH", "/api/me/preferences", bytes.NewReader(body))
	req = req.WithContext(auth.SetClaims(req.Context(), &auth.Claims{UserID: "user-123"}))

	w := httptest.NewRecorder()
	handler.UpdatePreferences(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestUpdatePreferences_NoClaims(t *testing.T) {
	store := &mockPreferenceStore{}
	handler := NewPreferenceHandler(store)

	body, _ := json.Marshal(map[string]string{"locale": "en"})
	req := httptest.NewRequest("PATCH", "/api/me/preferences", bytes.NewReader(body))

	w := httptest.NewRecorder()
	handler.UpdatePreferences(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
