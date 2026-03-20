package rbac

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/auth"
)

type PermissionChecker interface {
	HasPermission(ctx context.Context, userID, siteID, permission string) (bool, error)
}

type SiteExtractor func(r *http.Request) string

func SiteFromQuery(r *http.Request) string {
	return r.URL.Query().Get("site_id")
}

func SiteFromURLParam(r *http.Request) string {
	return chi.URLParam(r, "siteID")
}

type RBACMiddleware struct {
	checker PermissionChecker
}

func NewMiddleware(checker PermissionChecker) *RBACMiddleware {
	return &RBACMiddleware{checker: checker}
}

func (m *RBACMiddleware) Require(permission string, extractSite SiteExtractor) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := auth.GetClaims(r.Context())
			if claims == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			siteID := extractSite(r)
			allowed, err := m.checker.HasPermission(r.Context(), claims.UserID, siteID, permission)
			if err != nil {
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			if !allowed {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
