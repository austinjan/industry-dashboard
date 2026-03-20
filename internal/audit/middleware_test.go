package audit_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/industry-dashboard/server/internal/audit"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/stretchr/testify/assert"
)

type mockAuditStore struct {
	mu      sync.Mutex
	entries []audit.Entry
}

func (m *mockAuditStore) Log(ctx context.Context, entry audit.Entry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = append(m.entries, entry)
	return nil
}

func TestAuditMiddleware_LogsMutatingRequests(t *testing.T) {
	store := &mockAuditStore{}
	mw := audit.NewMiddleware(store)
	handler := mw.Log("role", "create")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	req := httptest.NewRequest("POST", "/api/roles", nil)
	claims := &auth.Claims{UserID: "user-1", Email: "user@test.com", TokenType: "access"}
	ctx := auth.SetClaims(req.Context(), claims)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	// Give goroutine time to complete
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Len(t, store.entries, 1)
	assert.Equal(t, "user-1", store.entries[0].UserID)
	assert.Equal(t, "role", store.entries[0].ResourceType)
	assert.Equal(t, "create", store.entries[0].Action)
}

func TestAuditMiddleware_SkipsUnauthenticated(t *testing.T) {
	store := &mockAuditStore{}
	mw := audit.NewMiddleware(store)
	handler := mw.Log("role", "create")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
	}))
	req := httptest.NewRequest("POST", "/api/roles", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)
	assert.Len(t, store.entries, 0)
}
