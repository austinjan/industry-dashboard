package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chiMiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/industry-dashboard/server/internal/alert"
	"github.com/industry-dashboard/server/internal/audit"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/config"
	"github.com/industry-dashboard/server/internal/database"
	"github.com/industry-dashboard/server/internal/datapoint"
	"github.com/industry-dashboard/server/internal/rbac"
	"github.com/industry-dashboard/server/internal/site"
	"github.com/industry-dashboard/server/internal/user"
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

	datapointStore := datapoint.NewStore(pool)
	datapointHandler := datapoint.NewHandler(datapointStore)

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

	// Protected API routes
	r.Route("/api", func(r chi.Router) {
		r.Use(authMW.Authenticate)

		// Current user
		if authHandler != nil {
			r.Get("/auth/me", authHandler.Me)
		}

		// Sites
		r.Route("/sites", func(r chi.Router) {
			r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/", siteHandler.ListSites)
			r.With(rbacMW.Require("site:manage", rbac.SiteFromQuery), auditMW.Log("site", "create")).Post("/", siteHandler.CreateSite)
			r.Route("/{siteID}", func(r chi.Router) {
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/", siteHandler.GetSite)
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/summary", siteHandler.GetSiteSummary)
				r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/lines", siteHandler.ListLines)
			})
		})

		// Lines
		r.Route("/lines/{lineID}", func(r chi.Router) {
			r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/machines", siteHandler.ListMachines)
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
		})

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
	})

	log.Printf("Server starting on :%s", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
