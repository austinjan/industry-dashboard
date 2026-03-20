package config

import "os"

type Config struct {
	Port        string
	DatabaseURL string
	AzureClientID     string
	AzureClientSecret string
	AzureTenantID     string
	AzureRedirectURL  string
	JWTSecret          string
	JWTAccessDuration  string
	JWTRefreshDuration string
}

func Load() *Config {
	return &Config{
		Port:               getEnv("PORT", "8080"),
		DatabaseURL:        getEnv("DATABASE_URL", "postgres://dashboard:dashboard@localhost:5432/industry_dashboard?sslmode=disable"),
		AzureClientID:      getEnv("AZURE_CLIENT_ID", ""),
		AzureClientSecret:  getEnv("AZURE_CLIENT_SECRET", ""),
		AzureTenantID:      getEnv("AZURE_TENANT_ID", ""),
		AzureRedirectURL:   getEnv("AZURE_REDIRECT_URL", "http://localhost:8080/api/auth/callback"),
		JWTSecret:          getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		JWTAccessDuration:  getEnv("JWT_ACCESS_DURATION", "15m"),
		JWTRefreshDuration: getEnv("JWT_REFRESH_DURATION", "168h"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
