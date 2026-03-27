package rbac

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/apierr"
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
				apierr.Write(w, r, http.StatusUnauthorized, "rbac.unauthorized", "Unauthorized", "", nil)
				return
			}
			// API key users bypass RBAC — read-only enforcement is handled in auth middleware
			if strings.HasPrefix(claims.UserID, "llm:") {
				next.ServeHTTP(w, r)
				return
			}
			userID := claims.UserID
			siteID := extractSite(r)
			allowed, err := m.checker.HasPermission(r.Context(), userID, siteID, permission)
			if err != nil {
				apierr.Write(w, r, http.StatusInternalServerError, "rbac.internal_error", "Internal server error", userID, err)
				return
			}
			if !allowed {
				apierr.Write(w, r, http.StatusForbidden, "rbac.forbidden", "Forbidden", userID, nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
