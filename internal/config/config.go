package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port        string
	DatabaseURL string
	AzureClientID        string
	AzureClientSecret    string
	AzureTenantID        string
	AzureRedirectURL     string
	AzureBindRedirectURL string
	JWTSecret          string
	JWTAccessDuration  string
	JWTRefreshDuration string
}

func Load() *Config {
	// Load .env file if it exists (silently ignore if not found)
	godotenv.Load()
	
	return &Config{
		Port:               getEnv("PORT", "8080"),
		DatabaseURL:        getDatabaseURL(),
		AzureClientID:      getEnv("AZURE_CLIENT_ID", ""),
		AzureClientSecret:  getEnv("AZURE_CLIENT_SECRET", ""),
		AzureTenantID:      getEnv("AZURE_TENANT_ID", ""),
		AzureRedirectURL:     getEnv("AZURE_REDIRECT_URL", "http://localhost:8080/api/auth/callback"),
		AzureBindRedirectURL: getEnv("AZURE_BIND_REDIRECT_URL", "http://localhost:8080/api/auth/bind/callback"),
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

// DBEnvInfo returns non-secret database connection info for display purposes.
type DBEnvInfo struct {
	Host    string `json:"host"`
	Port    string `json:"port"`
	User    string `json:"user"`
	DBName  string `json:"db_name"`
	SSLMode string `json:"sslmode"`
}

func GetDBEnvInfo() DBEnvInfo {
	return DBEnvInfo{
		Host:    getEnv("DB_HOST", "localhost"),
		Port:    getEnv("DB_PORT", "5432"),
		User:    getEnv("DB_USER", "dashboard"),
		DBName:  getEnv("DB_NAME", "industry_dashboard"),
		SSLMode: getEnv("DB_SSLMODE", "disable"),
	}
}

func getDatabaseURL() string {
	// If DATABASE_URL is set explicitly, use it
	if v := os.Getenv("DATABASE_URL"); v != "" {
		return v
	}
	// Otherwise build from individual vars
	user := getEnv("DB_USER", "dashboard")
	pass := getEnv("DB_PASSWORD", "dashboard")
	host := getEnv("DB_HOST", "localhost")
	port := getEnv("DB_PORT", "5432")
	name := getEnv("DB_NAME", "industry_dashboard")
	sslmode := getEnv("DB_SSLMODE", "disable")
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s", user, pass, host, port, name, sslmode)
}
