package audit

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/industry-dashboard/server/internal/auth"
)

type Middleware struct {
	logger Logger
}

func NewMiddleware(logger Logger) *Middleware {
	return &Middleware{logger: logger}
}

func (m *Middleware) Log(resourceType, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Capture request body before handler consumes it
			var details map[string]interface{}
			if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodDelete {
				bodyBytes, err := io.ReadAll(r.Body)
				r.Body.Close()
				if err == nil && len(bodyBytes) > 0 {
					// Try to parse as JSON for structured storage
					json.Unmarshal(bodyBytes, &details)
					// Restore body for the handler
					r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
				}
			}

			next.ServeHTTP(w, r)

			claims := auth.GetClaims(r.Context())
			if claims == nil {
				return
			}
			go m.logger.Log(context.Background(), Entry{
				UserID:       claims.UserID,
				Action:       action,
				ResourceType: resourceType,
				Details:      details,
				IPAddress:    extractIP(r),
				Timestamp:    time.Now(),
			})
		})
	}
}

func extractIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ip := strings.TrimSpace(strings.Split(forwarded, ",")[0])
		return cleanIP(ip)
	}
	return cleanIP(r.RemoteAddr)
}

func cleanIP(addr string) string {
	// Handle IPv6 with brackets: [::1]:port
	if strings.HasPrefix(addr, "[") {
		if idx := strings.Index(addr, "]"); idx != -1 {
			return addr[1:idx]
		}
	}
	// Handle IPv4: 127.0.0.1:port
	if strings.Count(addr, ":") == 1 {
		host, _, _ := strings.Cut(addr, ":")
		return host
	}
	// Plain IP (no port)
	return addr
}
