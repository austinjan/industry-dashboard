package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const claimsKey contextKey = "claims"

// APIKeyValidator validates a raw API key and returns its name.
type APIKeyValidator interface {
	ValidateKeyName(ctx context.Context, fullKey string) (name string, err error)
}

type Middleware struct {
	jwt          *JWTService
	apiKeyValidator APIKeyValidator
}

func NewMiddleware(jwt *JWTService) *Middleware {
	return &Middleware{jwt: jwt}
}

// SetAPIKeyValidator registers a validator for dk_-prefixed API keys.
func (m *Middleware) SetAPIKeyValidator(v APIKeyValidator) {
	m.apiKeyValidator = v
}

func (m *Middleware) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenString string

		// Check Authorization header first
		header := r.Header.Get("Authorization")
		if header != "" && strings.HasPrefix(header, "Bearer ") {
			tokenString = strings.TrimPrefix(header, "Bearer ")
		} else {
			// Fall back to cookie
			cookie, err := r.Cookie("access_token")
			if err != nil || cookie.Value == "" {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			tokenString = cookie.Value
		}

		// API key path: tokens prefixed with "dk_"
		if strings.HasPrefix(tokenString, "dk_") {
			if m.apiKeyValidator == nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			name, err := m.apiKeyValidator.ValidateKeyName(r.Context(), tokenString)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			claims := &Claims{
				UserID:    "llm:" + name,
				Email:     "llm:" + name + "@api",
				TokenType: "api_key",
			}
			// API keys are read-only; only allow writes to /api/llm/ admin routes
			if r.Method != http.MethodGet && !strings.HasPrefix(r.URL.Path, "/api/llm/") {
				http.Error(w, "API keys are read-only", http.StatusForbidden)
				return
			}
			ctx := context.WithValue(r.Context(), claimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// Standard JWT path
		claims, err := m.jwt.ValidateToken(tokenString)
		if err != nil || claims.TokenType != "access" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetClaims(ctx context.Context) *Claims {
	claims, _ := ctx.Value(claimsKey).(*Claims)
	return claims
}

func SetClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey, claims)
}
