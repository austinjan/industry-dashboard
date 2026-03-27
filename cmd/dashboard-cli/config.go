package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	URL    string `yaml:"url"`
	APIKey string `yaml:"api_key"`
}

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".dashboard-cli.yaml")
}

func loadConfig() (*Config, error) {
	cfg := &Config{}
	data, err := os.ReadFile(configPath())
	if err == nil {
		yaml.Unmarshal(data, cfg)
	}
	if v := os.Getenv("DASHBOARD_URL"); v != "" {
		cfg.URL = v
	}
	if v := os.Getenv("DASHBOARD_API_KEY"); v != "" {
		cfg.APIKey = v
	}
	if cfg.URL == "" || cfg.APIKey == "" {
		return nil, fmt.Errorf("not configured. Run: dashboard-cli configure --url URL --api-key KEY")
	}
	return cfg, nil
}

func runConfigure(args []string) {
	fs := flag.NewFlagSet("configure", flag.ExitOnError)
	url := fs.String("url", "", "Dashboard server URL")
	apiKey := fs.String("api-key", "", "API key (dk_...)")
	fs.Parse(args)

	if *url == "" || *apiKey == "" {
		printError("Both --url and --api-key are required", "dashboard-cli configure --url http://localhost:8080 --api-key dk_xxx")
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(*url + "/healthz")
	if err != nil || resp.StatusCode != 200 {
		printError(fmt.Sprintf("Cannot connect to %s", *url), "Verify the server is running and the URL is correct")
		return
	}

	cfg := Config{URL: *url, APIKey: *apiKey}
	data, _ := yaml.Marshal(cfg)
	os.WriteFile(configPath(), data, 0600)

	printJSON(map[string]interface{}{
		"meta":   map[string]string{"usage": "dashboard-cli configure --url URL --api-key KEY"},
		"result": "Configuration saved to " + configPath(),
		"tip":    "Run 'dashboard-cli sites' to verify",
	})
}
