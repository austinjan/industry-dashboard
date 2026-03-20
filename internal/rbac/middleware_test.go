package rbac_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/rbac"
	"github.com/stretchr/testify/assert"
)

type mockPermissionChecker struct {
	result bool
	err    error
}

func (m *mockPermissionChecker) HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error) {
	return m.result, m.err
}

func TestRBACMiddleware_Allowed(t *testing.T) {
	mw := rbac.NewMiddleware(&mockPermissionChecker{result: true})
	handler := mw.Require("dashboard:view", rbac.SiteFromQuery)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)
	req := httptest.NewRequest("GET", "/?site_id=site-1", nil)
	claims := &auth.Claims{UserID: "user-1", Email: "user@test.com", TokenType: "access"}
	ctx := auth.SetClaims(req.Context(), claims)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestRBACMiddleware_Denied(t *testing.T) {
	mw := rbac.NewMiddleware(&mockPermissionChecker{result: false})
	handler := mw.Require("user:manage", rbac.SiteFromQuery)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)
	req := httptest.NewRequest("GET", "/?site_id=site-1", nil)
	claims := &auth.Claims{UserID: "user-1", Email: "user@test.com", TokenType: "access"}
	ctx := auth.SetClaims(req.Context(), claims)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestRBACMiddleware_NoClaims(t *testing.T) {
	mw := rbac.NewMiddleware(&mockPermissionChecker{result: true})
	handler := mw.Require("dashboard:view", rbac.SiteFromQuery)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		}),
	)
	req := httptest.NewRequest("GET", "/?site_id=site-1", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
