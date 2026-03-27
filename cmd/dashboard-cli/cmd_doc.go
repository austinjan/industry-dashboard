package main

import (
	"strings"
)

func runDoc(args []string) {
	topic := ""
	if len(args) > 0 {
		topic = strings.Join(args, "/")
	}

	content, ok := docTopics[topic]
	if !ok {
		printError("Unknown topic: "+topic, "Run 'dashboard-cli doc' to see all topics")
		return
	}
	printJSON(content)
}

var docTopics = map[string]interface{}{
	"": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli doc [topic]",
		},
		"topics": []map[string]string{
			{"name": "alerts", "description": "Query alert events — severity, status, time range, line, machine filters"},
			{"name": "alert-rules", "description": "View alert rule configurations"},
			{"name": "audit", "description": "Query audit trail — user, action, resource, time range filters"},
			{"name": "machines", "description": "Machine status and hierarchy by site"},
			{"name": "metrics", "description": "Time-series data and latest sensor values"},
			{"name": "sites", "description": "List sites with summary statistics"},
			{"name": "workers", "description": "Worker fleet status and assignments"},
			{"name": "auth", "description": "API key setup and configuration"},
			{"name": "admin", "description": "API key management — create, list, revoke"},
			{"name": "configure", "description": "CLI configuration setup"},
			{"name": "output", "description": "Understanding JSON output format and pagination"},
		},
		"tip": "Run 'dashboard-cli doc <topic>' for details",
	},

	"alerts": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli alerts [flags]",
		},
		"description": "Query alert events from the dashboard. Alerts are triggered when sensor values exceed configured thresholds. Filter by severity, status, time range, production line, or machine.",
		"flags": []map[string]string{
			{"name": "--site", "description": "Filter by site ID", "example": "--site 1"},
			{"name": "--line", "description": "Filter by production line ID", "example": "--line 3"},
			{"name": "--machine", "description": "Filter by machine ID", "example": "--machine 7"},
			{"name": "--severity", "description": "Filter by severity: critical, warning, info", "example": "--severity critical"},
			{"name": "--status", "description": "Filter by status: active, acknowledged, resolved", "example": "--status active"},
			{"name": "--since", "description": "Start time (RFC3339 or relative like 1h, 24h, 7d)", "example": "--since 24h"},
			{"name": "--until", "description": "End time (RFC3339)", "example": "--until 2024-01-01T00:00:00Z"},
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 5"},
		},
		"examples": []string{
			"dashboard-cli alerts",
			"dashboard-cli alerts --severity critical --status active",
			"dashboard-cli alerts --site 1 --since 24h",
			"dashboard-cli alerts --machine 7 --since 1h",
			"dashboard-cli alerts --page 2",
		},
		"see_also": []string{"alert-rules", "machines", "sites"},
	},

	"alert-rules": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli alert-rules [flags]",
		},
		"description": "View alert rule configurations. Alert rules define the conditions (metric, threshold, severity) that trigger alert events when sensor data is received from workers.",
		"flags": []map[string]string{
			{"name": "--site", "description": "Filter rules by site ID", "example": "--site 1"},
			{"name": "--line", "description": "Filter rules by production line ID", "example": "--line 2"},
			{"name": "--machine", "description": "Filter rules by machine ID", "example": "--machine 5"},
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 10"},
		},
		"examples": []string{
			"dashboard-cli alert-rules",
			"dashboard-cli alert-rules --site 1",
			"dashboard-cli alert-rules --machine 5",
		},
		"see_also": []string{"alerts", "machines", "metrics"},
	},

	"audit": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli audit [flags]",
		},
		"description": "Query the audit trail. The audit log records all mutating API actions including user, action type, resource, and timestamp. Useful for security review, compliance, and debugging configuration changes.",
		"flags": []map[string]string{
			{"name": "--user", "description": "Filter by user email or ID", "example": "--user admin@example.com"},
			{"name": "--action", "description": "Filter by action type (e.g. create, update, delete)", "example": "--action delete"},
			{"name": "--resource", "description": "Filter by resource type (e.g. alert_rule, site, machine)", "example": "--resource alert_rule"},
			{"name": "--since", "description": "Start time (RFC3339 or relative like 1h, 24h, 7d)", "example": "--since 7d"},
			{"name": "--until", "description": "End time (RFC3339)", "example": "--until 2024-01-01T00:00:00Z"},
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 10"},
		},
		"examples": []string{
			"dashboard-cli audit",
			"dashboard-cli audit --since 24h",
			"dashboard-cli audit --user admin@example.com --action delete",
			"dashboard-cli audit --resource alert_rule --since 7d",
		},
		"see_also": []string{"admin", "sites"},
	},

	"machines": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli machines [flags]",
		},
		"description": "List machines and their current status within the site/line/machine hierarchy. Shows machine type, assigned worker, and last-seen time. Use --site or --line to narrow the scope.",
		"flags": []map[string]string{
			{"name": "--site", "description": "Filter by site ID", "example": "--site 1"},
			{"name": "--line", "description": "Filter by production line ID", "example": "--line 2"},
			{"name": "--status", "description": "Filter by status: online, offline, degraded", "example": "--status offline"},
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 10"},
		},
		"examples": []string{
			"dashboard-cli machines",
			"dashboard-cli machines --site 1",
			"dashboard-cli machines --line 3 --status offline",
			"dashboard-cli machines --head 5",
		},
		"see_also": []string{"sites", "workers", "metrics", "alerts"},
	},

	"metrics": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli metrics [flags]",
		},
		"description": "Query time-series sensor data and latest values. Returns data points collected from machines via workers. Use --latest for the most recent value per metric, or specify a time range for historical data.",
		"flags": []map[string]string{
			{"name": "--machine", "description": "Filter by machine ID (required for time-series)", "example": "--machine 7"},
			{"name": "--metric", "description": "Metric name to query (e.g. temperature, pressure)", "example": "--metric temperature"},
			{"name": "--latest", "description": "Return only the latest value for each metric", "example": "--latest"},
			{"name": "--since", "description": "Start time for time-series (RFC3339 or relative like 1h)", "example": "--since 1h"},
			{"name": "--until", "description": "End time for time-series (RFC3339)", "example": "--until 2024-01-01T00:00:00Z"},
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 20"},
		},
		"examples": []string{
			"dashboard-cli metrics --machine 7 --latest",
			"dashboard-cli metrics --machine 7 --metric temperature --since 1h",
			"dashboard-cli metrics --machine 7 --since 24h --page 2",
		},
		"see_also": []string{"machines", "alert-rules", "workers"},
	},

	"sites": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli sites [flags]",
		},
		"description": "List all sites with summary statistics. Each site contains production lines and machines. The summary includes active alert counts, machine counts, and worker assignments.",
		"flags": []map[string]string{
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 5"},
		},
		"examples": []string{
			"dashboard-cli sites",
			"dashboard-cli sites --head 3",
		},
		"see_also": []string{"machines", "workers", "alerts"},
	},

	"workers": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli workers [flags]",
		},
		"description": "View the worker fleet status. Workers are processes that collect data from machines (via Modbus or simulation) and push it to the dashboard. Shows worker ID, assigned site/line/machine, last heartbeat, and connection status.",
		"flags": []map[string]string{
			{"name": "--site", "description": "Filter workers by site ID", "example": "--site 1"},
			{"name": "--status", "description": "Filter by worker status: active, inactive, error", "example": "--status active"},
			{"name": "--page", "description": "Page number for pagination (default 1)", "example": "--page 2"},
			{"name": "--head", "description": "Limit output to N records", "example": "--head 10"},
		},
		"examples": []string{
			"dashboard-cli workers",
			"dashboard-cli workers --status active",
			"dashboard-cli workers --site 1",
		},
		"see_also": []string{"machines", "sites", "metrics"},
	},

	"auth": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli configure --url URL --api-key KEY",
		},
		"description": "The CLI authenticates using API keys (prefixed with 'dk_'). API keys are created by admins via the dashboard or using 'dashboard-cli admin create-key'. Keys are stored in ~/.dashboard-cli.yaml and can be overridden by environment variables.",
		"flags": []map[string]string{
			{"name": "DASHBOARD_URL", "description": "Environment variable to override the server URL", "example": "export DASHBOARD_URL=http://localhost:8080"},
			{"name": "DASHBOARD_API_KEY", "description": "Environment variable to override the API key", "example": "export DASHBOARD_API_KEY=dk_xxx"},
		},
		"examples": []string{
			"dashboard-cli configure --url http://localhost:8080 --api-key dk_xxx",
			"DASHBOARD_URL=http://prod.example.com DASHBOARD_API_KEY=dk_yyy dashboard-cli sites",
		},
		"see_also": []string{"configure", "admin"},
	},

	"admin": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli admin <subcommand> [flags]",
		},
		"description": "Manage API keys for programmatic access to the dashboard. Requires admin privileges. Subcommands: list-keys, create-key, revoke-key.",
		"subcommands": []map[string]string{
			{"name": "list-keys", "description": "List all active API keys"},
			{"name": "create-key", "description": "Create a new API key with a given name"},
			{"name": "revoke-key", "description": "Revoke an API key by ID"},
		},
		"flags": []map[string]string{
			{"name": "--name", "description": "Name for the new API key (used with create-key)", "example": "--name ci-pipeline"},
			{"name": "--id", "description": "API key ID to revoke (used with revoke-key)", "example": "--id 42"},
		},
		"examples": []string{
			"dashboard-cli admin list-keys",
			"dashboard-cli admin create-key --name ci-pipeline",
			"dashboard-cli admin revoke-key --id 42",
		},
		"see_also": []string{"auth", "configure", "audit"},
	},

	"configure": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli configure --url URL --api-key KEY",
		},
		"description": "Configure the CLI with the dashboard server URL and an API key. Configuration is saved to ~/.dashboard-cli.yaml with permissions 0600. Environment variables DASHBOARD_URL and DASHBOARD_API_KEY override the file.",
		"flags": []map[string]string{
			{"name": "--url", "description": "Dashboard server base URL", "example": "--url http://localhost:8080"},
			{"name": "--api-key", "description": "API key starting with 'dk_'", "example": "--api-key dk_abc123"},
		},
		"examples": []string{
			"dashboard-cli configure --url http://localhost:8080 --api-key dk_xxx",
			"dashboard-cli configure --url https://dashboard.example.com --api-key dk_prod_key",
		},
		"see_also": []string{"auth", "admin"},
	},

	"output": map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli <command> [--page N] [--head N]",
		},
		"description": "All commands output a JSON object. The 'meta' field contains usage info, pagination details (showing, total, remaining), and a 'next' command string when more results are available. Output is sized to fit ~1000 tokens for LLM context efficiency.",
		"pagination": map[string]interface{}{
			"description": "Use --page to navigate through result sets. Use --head to limit results.",
			"fields": []map[string]string{
				{"field": "meta.showing", "description": "Number of records in this response"},
				{"field": "meta.total", "description": "Total number of matching records"},
				{"field": "meta.remaining", "description": "Records not yet shown"},
				{"field": "meta.next", "description": "Suggested command to get the next page (only present if more records exist)"},
			},
		},
		"examples": []string{
			"dashboard-cli alerts --page 1",
			"dashboard-cli alerts --page 2",
			"dashboard-cli alerts --head 5",
		},
		"see_also": []string{"sites", "alerts", "machines"},
	},
}
