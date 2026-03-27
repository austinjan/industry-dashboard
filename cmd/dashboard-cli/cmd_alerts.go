package main

import (
	"flag"
	"fmt"
)

func runAlerts(args []string) {
	fs := flag.NewFlagSet("alerts", flag.ExitOnError)
	site := fs.String("site", "", "Site ID or code (required)")
	severity := fs.String("severity", "", "Filter by severity: critical, warning, info")
	status := fs.String("status", "", "Filter by status: active, acknowledged, resolved")
	last := fs.String("last", "", "Time range: 1h, 6h, 24h, 3d, 7d, 30d")

	head, page, remaining := parseCommonFlags(args)
	fs.Parse(remaining)

	if *site == "" {
		printError("--site is required", "dashboard-cli alerts --site <ID|code>")
	}

	if head == 0 {
		meta := buildMeta("dashboard-cli alerts --site SITE [--severity SEVERITY] [--status STATUS] [--last RANGE] [--page N] [--head N]", 0, 0, page, "")
		printJSON(map[string]interface{}{"meta": meta})
		return
	}

	c := newClient()
	siteID := resolveSiteID(c, *site)

	ps := pageSize(70) // alerts are ~70 tokens each
	limit := ps
	if head > 0 && head < limit {
		limit = head
	}
	offset := (page - 1) * ps

	since := parseLast(*last)

	query := fmt.Sprintf("/alert-events?site_id=%s&limit=%d&offset=%d", siteID, limit, offset)
	if *severity != "" {
		query += "&severity=" + *severity
	}
	if *status != "" {
		query += "&status=" + *status
	}
	if since != "" {
		query += "&since=" + since
	}

	var resp struct {
		Events []map[string]interface{} `json:"events"`
		Total  int                      `json:"total"`
	}
	if err := c.getJSON(query, &resp); err != nil {
		printError("Failed to fetch alerts: "+err.Error(), "Check your connection and API key")
	}

	// Format each alert compactly
	events := make([]map[string]interface{}, 0, len(resp.Events))
	for _, e := range resp.Events {
		entry := map[string]interface{}{
			"id":           e["id"],
			"alert_name":   e["alert_name"],
			"machine_name": e["machine_name"],
			"line_name":    e["line_name"],
			"metric_name":  e["metric_name"],
			"severity":     e["severity"],
			"triggered_at": e["triggered_at"],
		}

		// Format reading
		if tv, ok := e["triggered_value"]; ok && tv != nil {
			threshold, _ := toFloat64(e["threshold"])
			value, _ := toFloat64(tv)
			condition, _ := e["condition"].(string)

			if condition == "==" && (threshold == 0 || threshold == 1) {
				if threshold == 1 {
					entry["reading"] = "metric = ON"
				} else {
					entry["reading"] = "metric = OFF"
				}
			} else {
				entry["reading"] = fmt.Sprintf("%.2f %s %.2f", value, condition, threshold)
			}
		}

		if ra, ok := e["resolved_at"]; ok && ra != nil {
			entry["resolved_at"] = ra
		}
		if ab, ok := e["acknowledged_by"]; ok && ab != nil {
			entry["acknowledged_by"] = ab
		}

		events = append(events, entry)
	}

	usageCmd := "dashboard-cli alerts --site " + *site
	if *severity != "" {
		usageCmd += " --severity " + *severity
	}
	if *status != "" {
		usageCmd += " --status " + *status
	}
	if *last != "" {
		usageCmd += " --last " + *last
	}

	nextCmd := ""
	if page*ps < resp.Total {
		nextCmd = usageCmd + fmt.Sprintf(" --page %d", page+1)
	}

	meta := buildMeta(
		"dashboard-cli alerts --site SITE [--severity SEVERITY] [--status STATUS] [--last RANGE] [--page N] [--head N]",
		len(events), resp.Total, page, nextCmd,
	)

	printJSON(map[string]interface{}{
		"meta":   meta,
		"alerts": events,
	})
}

func toFloat64(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	}
	s := fmt.Sprintf("%v", v)
	var f float64
	if _, err := fmt.Sscanf(s, "%f", &f); err == nil {
		return f, true
	}
	return 0, false
}

