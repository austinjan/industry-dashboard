package main

import (
	"flag"
	"fmt"
)

func runAlertRules(args []string) {
	fs := flag.NewFlagSet("alert-rules", flag.ExitOnError)
	site := fs.String("site", "", "Site ID or code (required)")

	head, _, remaining := parseCommonFlags(args)
	fs.Parse(remaining)

	if *site == "" {
		printError("--site is required", "dashboard-cli alert-rules --site <ID|code>")
	}

	if head == 0 {
		meta := buildMeta("dashboard-cli alert-rules --site SITE [--head N]", 0, 0, 1, "")
		printJSON(map[string]interface{}{"meta": meta})
		return
	}

	c := newClient()
	siteID := resolveSiteID(c, *site)

	var rules []map[string]interface{}
	if err := c.getJSON(fmt.Sprintf("/alerts?site_id=%s", siteID), &rules); err != nil {
		printError("Failed to fetch alert rules: "+err.Error(), "Check your connection and API key")
	}

	limit := len(rules)
	if head > 0 && head < limit {
		limit = head
	}
	rules = rules[:limit]

	meta := buildMeta(
		"dashboard-cli alert-rules --site SITE [--head N]",
		len(rules), len(rules), 1, "",
	)

	printJSON(map[string]interface{}{
		"meta":        meta,
		"alert_rules": rules,
	})
}
