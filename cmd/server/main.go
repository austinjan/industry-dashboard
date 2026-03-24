package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/industry-dashboard/server/internal/alert"
	"github.com/industry-dashboard/server/internal/audit"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/dashboard"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/datapoint"
	"github.com/industry-dashboard/server/internal/rbac"
	"github.com/industry-dashboard/server/internal/site"
	"github.com/industry-dashboard/server/internal/user"
	"github.com/industry-dashboard/server/internal/worker_api"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Parse JWT durations
	accessDuration, err := time.ParseDuration(cfg.JWTAccessDuration)
	if err != nil {
		log.Fatalf("Invalid JWT_ACCESS_DURATION %q: %v", cfg.JWTAccessDuration, err)
	}
	refreshDuration, err := time.ParseDuration(cfg.JWTRefreshDuration)
	if err != nil {
		log.Fatalf("Invalid JWT_REFRESH_DURATION %q: %v", cfg.JWTRefreshDuration, err)
	}

	// Services
	jwtService := auth.NewJWTService(cfg.JWTSecret, accessDuration, refreshDuration)
	authMW := auth.NewMiddleware(jwtService)

	rbacStore := rbac.NewStore(pool)
	rbacService := rbac.NewService(rbacStore)
	rbacMW := rbac.NewMiddleware(rbacService)
	rbacHandler := rbac.NewHandler(rbacStore)

	auditStore := audit.NewStore(pool)
	auditMW := audit.NewMiddleware(auditStore)
	auditHandler := audit.NewHandler(auditStore)

	siteStore := site.NewStore(pool)
	siteHandler := site.NewHandler(siteStore)

	alertStore := alert.NewStore(pool)
	alertHandler := alert.NewHandler(alertStore)

	userStore := user.NewStore(pool)
	userHandler := user.NewHandler(userStore)
	prefHandler := user.NewPreferenceHandler(userStore)

	datapointStore := datapoint.NewStore(pool)
	datapointHandler := datapoint.NewHandler(datapointStore)

	dashboardStore := dashboard.NewStore(pool)
	dashboardHandler := dashboard.NewHandler(dashboardStore, rbacStore)

	workerAPIStore := worker_api.NewStore(pool)
	workerAPIHandler := worker_api.NewHandler(workerAPIStore)

	// OIDC client (optional — skip if Azure not configured)
	var authHandler *auth.Handler
	if cfg.AzureClientID != "" {
		oidcClient, err := auth.NewOIDCClient(ctx, cfg.AzureTenantID, cfg.AzureClientID, cfg.AzureClientSecret, cfg.AzureRedirectURL)
		if err != nil {
			log.Printf("Warning: OIDC client setup failed: %v (auth endpoints disabled)", err)
		} else {
			authHandler = auth.NewHandler(oidcClient, jwtService, pool)
		}
	}

	// Router
	r := chi.NewRouter()
	r.Use(chiMiddleware.Logger)
	r.Use(chiMiddleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// Auth routes (public)
	if authHandler != nil {
		r.Route("/api/auth", func(r chi.Router) {
			r.Get("/login", authHandler.Login)
			r.Get("/callback", authHandler.Callback)
			r.Post("/refresh", authHandler.Refresh)
			r.Post("/logout", authHandler.Logout)
		})
	}

	// Dev mode: seed data + bypass auth
	if os.Getenv("DEV_MODE") == "1" {
		log.Println("⚠ DEV_MODE enabled — dev login and seed endpoints active")

		r.Get("/dev/seed", func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			// Create test user
			var userID string
			err := pool.QueryRow(ctx,
				`INSERT INTO users (email, name, microsoft_id, is_active)
				 VALUES ('dev@example.com', 'Dev User', 'dev-local', true)
				 ON CONFLICT (microsoft_id) DO UPDATE SET email = EXCLUDED.email
				 RETURNING id`).Scan(&userID)
			if err != nil {
				http.Error(w, "failed to create user: "+err.Error(), 500)
				return
			}
			// Assign admin role (global)
			var adminRoleID string
			_ = pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = 'Admin'`).Scan(&adminRoleID)
			if adminRoleID != "" {
				pool.Exec(ctx,
					`INSERT INTO user_site_roles (user_id, role_id, site_id) VALUES ($1, $2, NULL) ON CONFLICT DO NOTHING`,
					userID, adminRoleID)
			}
			// Create test sites
			var siteAID, siteBID string
			pool.QueryRow(ctx,
				`INSERT INTO sites (name, code, timezone) VALUES ('Factory Alpha', 'ALPHA', 'Asia/Taipei')
				 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`).Scan(&siteAID)
			pool.QueryRow(ctx,
				`INSERT INTO sites (name, code, timezone) VALUES ('Factory Beta', 'BETA', 'Asia/Tokyo')
				 ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`).Scan(&siteBID)
			// Create production lines + machines for site A
			var line1ID, line2ID string
			pool.QueryRow(ctx,
				`INSERT INTO production_lines (site_id, name, display_order)
				 VALUES ($1, 'Assembly Line 1', 1)
				 ON CONFLICT DO NOTHING RETURNING id`, siteAID).Scan(&line1ID)
			pool.QueryRow(ctx,
				`INSERT INTO production_lines (site_id, name, display_order)
				 VALUES ($1, 'Packaging Line 2', 2)
				 ON CONFLICT DO NOTHING RETURNING id`, siteAID).Scan(&line2ID)
			if line1ID != "" {
				pool.Exec(ctx, `INSERT INTO machines (line_id, name, model, status) VALUES ($1, 'CNC-01', 'Haas VF-2', 'running') ON CONFLICT DO NOTHING`, line1ID)
				pool.Exec(ctx, `INSERT INTO machines (line_id, name, model, status) VALUES ($1, 'CNC-02', 'Haas VF-2', 'running') ON CONFLICT DO NOTHING`, line1ID)
				pool.Exec(ctx, `INSERT INTO machines (line_id, name, model, status) VALUES ($1, 'CNC-03', 'Haas VF-3', 'offline') ON CONFLICT DO NOTHING`, line1ID)
			}
			if line2ID != "" {
				pool.Exec(ctx, `INSERT INTO machines (line_id, name, model, status) VALUES ($1, 'PKG-01', 'Bosch PK-200', 'running') ON CONFLICT DO NOTHING`, line2ID)
				pool.Exec(ctx, `INSERT INTO machines (line_id, name, model, status) VALUES ($1, 'PKG-02', 'Bosch PK-200', 'error') ON CONFLICT DO NOTHING`, line2ID)
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"status":  "seeded",
				"user_id": userID,
				"site_a":  siteAID,
				"site_b":  siteBID,
			})
		})

		r.Get("/dev/seed-data", func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			// Get all machine IDs
			rows, err := pool.Query(ctx, `SELECT id FROM machines`)
			if err != nil {
				http.Error(w, "failed to query machines: "+err.Error(), 500)
				return
			}
			defer rows.Close()
			var machineIDs []string
			for rows.Next() {
				var id string
				rows.Scan(&id)
				machineIDs = append(machineIDs, id)
			}
			if len(machineIDs) == 0 {
				http.Error(w, "run /dev/seed first", 400)
				return
			}

			metrics := []string{"temperature", "speed", "power", "vibration"}
			inserted := 0

			// Generate 24h of data points for each machine, every 5 minutes
			for _, machineID := range machineIDs {
				for _, metric := range metrics {
					baseValue := 50.0
					switch metric {
					case "temperature":
						baseValue = 70.0
					case "speed":
						baseValue = 120.0
					case "power":
						baseValue = 4.0
					case "vibration":
						baseValue = 0.5
					}
					for i := 0; i < 288; i++ { // 24h * 12 (every 5 min)
						// Add some randomness using the loop index
						variance := float64(i%20-10) / 10.0 * baseValue * 0.1
						value := baseValue + variance
						_, err := pool.Exec(ctx,
							`INSERT INTO data_points (time, machine_id, metric_name, value)
							 VALUES (NOW() - make_interval(mins => $1), $2, $3, $4)`,
							i*5, machineID, metric, value)
						if err == nil {
							inserted++
						}
					}
				}
			}

			// Create alerts and alert events
			for _, machineID := range machineIDs[:2] { // First 2 machines
				var alertID string
				pool.QueryRow(ctx,
					`INSERT INTO alerts (name, machine_id, metric_name, condition, threshold, severity)
					 VALUES ('High Temperature', $1, 'temperature', '>', 80, 'critical')
					 ON CONFLICT DO NOTHING RETURNING id`, machineID).Scan(&alertID)
				if alertID != "" {
					pool.Exec(ctx,
						`INSERT INTO alert_events (alert_id, triggered_at)
						 VALUES ($1, NOW() - interval '30 minutes')`, alertID)
					pool.Exec(ctx,
						`INSERT INTO alert_events (alert_id, triggered_at)
						 VALUES ($1, NOW() - interval '2 hours')`, alertID)
				}
				var alertID2 string
				pool.QueryRow(ctx,
					`INSERT INTO alerts (name, machine_id, metric_name, condition, threshold, severity)
					 VALUES ('Low Speed', $1, 'speed', '<', 100, 'warning')
					 ON CONFLICT DO NOTHING RETURNING id`, machineID).Scan(&alertID2)
				if alertID2 != "" {
					pool.Exec(ctx,
						`INSERT INTO alert_events (alert_id, triggered_at)
						 VALUES ($1, NOW() - interval '1 hour')`, alertID2)
				}
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status":       "data seeded",
				"machines":     len(machineIDs),
				"metrics":      len(metrics),
				"data_points":  inserted,
				"alert_events": 6,
			})
		})

		r.Get("/dev/login", func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			var userID, email string
			err := pool.QueryRow(ctx, `SELECT id, email FROM users WHERE microsoft_id = 'dev-local'`).Scan(&userID, &email)
			if err != nil {
				http.Error(w, "run /dev/seed first", 400)
				return
			}
			accessToken, _ := jwtService.CreateAccessToken(userID, email)
			refreshToken, _ := jwtService.CreateRefreshToken(userID, email)
			http.SetCookie(w, &http.Cookie{
				Name: "access_token", Value: accessToken, Path: "/",
				HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 900,
			})
			http.SetCookie(w, &http.Cookie{
				Name: "refresh_token", Value: refreshToken, Path: "/api/auth",
				HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 604800,
			})
			http.Redirect(w, r, "http://localhost:5173/", http.StatusTemporaryRedirect)
		})

		// Dev /api/auth/me fallback (when OIDC not configured)
		if authHandler == nil {
			r.Route("/api/auth", func(r chi.Router) {
				r.Get("/me", func(w http.ResponseWriter, r *http.Request) {
					cookie, err := r.Cookie("access_token")
					if err != nil || cookie.Value == "" {
						http.Error(w, "unauthorized", http.StatusUnauthorized)
						return
					}
					claims, err := jwtService.ValidateToken(cookie.Value)
					if err != nil {
						http.Error(w, "unauthorized", http.StatusUnauthorized)
						return
					}
					var u struct {
						ID     string  `json:"id"`
						Email  string  `json:"email"`
						Name   string  `json:"name"`
						Locale *string `json:"locale"`
					}
					err = pool.QueryRow(r.Context(), "SELECT id, email, name, locale FROM users WHERE id = $1", claims.UserID).Scan(&u.ID, &u.Email, &u.Name, &u.Locale)
					if err != nil {
						http.Error(w, "user not found", http.StatusNotFound)
						return
					}
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(u)
				})
				r.Post("/refresh", func(w http.ResponseWriter, r *http.Request) {
					cookie, err := r.Cookie("refresh_token")
					if err != nil || cookie.Value == "" {
						http.Error(w, "no refresh token", http.StatusUnauthorized)
						return
					}
					claims, err := jwtService.ValidateToken(cookie.Value)
					if err != nil || claims.TokenType != "refresh" {
						http.Error(w, "invalid refresh token", http.StatusUnauthorized)
						return
					}
					accessToken, _ := jwtService.CreateAccessToken(claims.UserID, claims.Email)
					refreshToken, _ := jwtService.CreateRefreshToken(claims.UserID, claims.Email)
					http.SetCookie(w, &http.Cookie{
						Name: "access_token", Value: accessToken, Path: "/",
						HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 900,
					})
					http.SetCookie(w, &http.Cookie{
						Name: "refresh_token", Value: refreshToken, Path: "/api/auth",
						HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: 604800,
					})
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
				})
				r.Post("/logout", func(w http.ResponseWriter, r *http.Request) {
					http.SetCookie(w, &http.Cookie{Name: "access_token", Value: "", Path: "/", MaxAge: -1, HttpOnly: true})
					http.SetCookie(w, &http.Cookie{Name: "refresh_token", Value: "", Path: "/api/auth", MaxAge: -1, HttpOnly: true})
					w.WriteHeader(http.StatusNoContent)
				})
			})
		}
	}

	// Protected API routes
	r.Route("/api", func(r chi.Router) {
		r.Use(authMW.Authenticate)

		// Current user
		if authHandler != nil {
			r.Get("/auth/me", authHandler.Me)
		}

		// User preferences (no RBAC — users update their own)
		r.Patch("/me/preferences", prefHandler.UpdatePreferences)

		// Global scope helper (no site scoping — used for admin routes)
		globalScope := func(r *http.Request) string { return "" }

		// Admin: all sites (global scope)
		r.With(rbacMW.Require("site:manage", globalScope)).Get("/admin/sites", siteHandler.ListAllSites)

		// Sites
		r.Route("/sites", func(r chi.Router) {
			r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/", siteHandler.ListSites)
			r.With(rbacMW.Require("site:manage", rbac.SiteFromQuery), auditMW.Log("site", "create")).Post("/", siteHandler.CreateSite)
			r.Route("/{siteID}", func(r chi.Router) {
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/", siteHandler.GetSite)
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/summary", siteHandler.GetSiteSummary)
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/lines", siteHandler.ListLines)
				r.With(rbacMW.Require("site:manage", rbac.SiteFromURLParam), auditMW.Log("site", "update")).Put("/", siteHandler.UpdateSite)
				r.With(rbacMW.Require("site:manage", rbac.SiteFromURLParam), auditMW.Log("site", "delete")).Delete("/", siteHandler.DeleteSite)
				r.With(rbacMW.Require("site:manage", rbac.SiteFromURLParam)).Get("/detail", siteHandler.GetSiteDetail)
				r.With(rbacMW.Require("site:manage", rbac.SiteFromURLParam), auditMW.Log("line", "create")).Post("/lines", siteHandler.CreateLine)
			})
		})

		// Lines
		r.Route("/lines/{lineID}", func(r chi.Router) {
			r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/machines", siteHandler.ListMachines)
			r.With(rbacMW.Require("site:manage", rbac.SiteFromQuery), auditMW.Log("line", "update")).Put("/", siteHandler.UpdateLine)
			r.With(rbacMW.Require("site:manage", rbac.SiteFromQuery), auditMW.Log("line", "delete")).Delete("/", siteHandler.DeleteLine)
			r.With(rbacMW.Require("machine:edit", rbac.SiteFromQuery), auditMW.Log("machine", "create")).Post("/machines", siteHandler.CreateMachine)
		})

		// Alerts
		r.Route("/alerts", func(r chi.Router) {
			r.With(rbacMW.Require("alert:view", rbac.SiteFromQuery)).Get("/", alertHandler.ListAlerts)
			r.With(rbacMW.Require("alert:create", rbac.SiteFromQuery), auditMW.Log("alert", "create")).Post("/", alertHandler.CreateAlert)
		})
		r.Route("/alert-events", func(r chi.Router) {
			r.With(rbacMW.Require("alert:view", rbac.SiteFromQuery)).Get("/", alertHandler.ListAlertEvents)
			r.With(rbacMW.Require("alert:acknowledge", rbac.SiteFromQuery), auditMW.Log("alert_event", "acknowledge")).Post("/{eventID}/acknowledge", alertHandler.AcknowledgeAlertEvent)
		})

		// Users (admin)
		r.With(rbacMW.Require("user:manage", rbac.SiteFromQuery)).Get("/users", userHandler.ListUsers)

		// Data points
		r.Get("/datapoints", datapointHandler.GetTimeSeries)
		r.Route("/machines/{machineID}", func(r chi.Router) {
			r.Get("/metrics", datapointHandler.GetMachineMetrics)
			r.Get("/latest", datapointHandler.GetLatestValues)
			r.With(rbacMW.Require("machine:edit", rbac.SiteFromQuery), auditMW.Log("machine", "update")).Put("/", siteHandler.UpdateMachine)
			r.With(rbacMW.Require("machine:edit", rbac.SiteFromQuery), auditMW.Log("machine", "delete")).Delete("/", siteHandler.DeleteMachine)
		})

		// Dashboards
		r.Route("/dashboards", func(r chi.Router) {
			r.With(rbacMW.Require("dashboard:view", rbac.SiteFromQuery)).Get("/", dashboardHandler.ListDashboards)
			r.With(rbacMW.Require("dashboard:create", rbac.SiteFromQuery), auditMW.Log("dashboard", "create")).Post("/", dashboardHandler.CreateDashboard)
			r.Route("/{dashboardID}", func(r chi.Router) {
				r.Get("/", dashboardHandler.GetDashboard)
				r.With(auditMW.Log("dashboard", "update")).Put("/", dashboardHandler.UpdateDashboard)
				r.With(rbacMW.Require("dashboard:delete", rbac.SiteFromQuery), auditMW.Log("dashboard", "delete")).Delete("/", dashboardHandler.DeleteDashboard)
				r.With(auditMW.Log("dashboard", "save_widgets")).Put("/widgets", dashboardHandler.SaveWidgets)
				r.Get("/access", dashboardHandler.GetAccess)
				r.With(rbacMW.Require("dashboard:share", rbac.SiteFromQuery), auditMW.Log("dashboard", "set_access")).Put("/access", dashboardHandler.SetAccess)
			})
		})

		// Widget types
		r.Get("/widget-types", dashboardHandler.ListWidgetTypes)

		// RBAC admin
		r.Route("/rbac", func(r chi.Router) {
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/roles", rbacHandler.ListRoles)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/permissions", rbacHandler.ListPermissions)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/roles/{roleID}/permissions", rbacHandler.GetRolePermissions)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery), auditMW.Log("role", "create")).Post("/roles", rbacHandler.CreateRole)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery), auditMW.Log("user_site_role", "assign")).Post("/assignments", rbacHandler.AssignUserSiteRole)
			r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery), auditMW.Log("user_site_role", "remove")).Delete("/assignments/{id}", rbacHandler.RemoveUserSiteRole)
		})

		// Audit logs
		r.With(rbacMW.Require("audit:view", rbac.SiteFromQuery)).Get("/audit-logs", auditHandler.List)

		// Workers (global permission — no site scope)
		r.Route("/workers", func(r chi.Router) {
			r.With(rbacMW.Require("workers:manage", globalScope)).Get("/", workerAPIHandler.ListWorkers)
			r.Route("/{workerID}", func(r chi.Router) {
				r.With(rbacMW.Require("workers:manage", globalScope)).Get("/", workerAPIHandler.GetWorker)
				r.With(rbacMW.Require("workers:manage", globalScope), auditMW.Log("worker", "command")).Post("/commands", workerAPIHandler.SendCommand)
				r.With(rbacMW.Require("workers:manage", globalScope)).Get("/commands", workerAPIHandler.ListCommands)
			})
		})
	})

	log.Printf("Server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
