package main

import (
	"flag"
	"fmt"
	"strings"
)

func runAudit(args []string) {
	fs := flag.NewFlagSet("audit", flag.ExitOnError)
	user := fs.String("user", "", "Filter by user name or email (or UUID)")
	action := fs.String("action", "", "Filter by action (e.g. create, update, delete)")
	resource := fs.String("resource", "", "Filter by resource type (e.g. alert_rule, site, machine)")
	last := fs.String("last", "", "Time range: 1h, 6h, 24h, 3d, 7d, 30d")

	head, page, remaining := parseCommonFlags(args)
	fs.Parse(remaining)

	if head == 0 {
		meta := buildMeta("dashboard-cli audit [--user USER] [--action ACTION] [--resource RESOURCE] [--last RANGE] [--page N] [--head N]", 0, 0, page, "")
		printJSON(map[string]interface{}{"meta": meta})
		return
	}

	c := newClient()

	// Resolve user to user_id if needed
	userID := ""
	if *user != "" {
		userID = resolveUserID(c, *user)
	}

	ps := pageSize(40) // audit logs are ~40 tokens each
	limit := ps
	if head > 0 && head < limit {
		limit = head
	}
	offset := (page - 1) * ps
	since := parseLast(*last)

	query := fmt.Sprintf("/audit-logs?limit=%d&offset=%d", limit, offset)
	if userID != "" {
		query += "&user_id=" + userID
	}
	if *action != "" {
		query += "&action=" + *action
	}
	if *resource != "" {
		query += "&resource_type=" + *resource
	}
	if since != "" {
		query += "&since=" + since
	}

	var resp struct {
		Logs  []map[string]interface{} `json:"logs"`
		Total int                      `json:"total"`
	}
	if err := c.getJSON(query, &resp); err != nil {
		printError("Failed to fetch audit logs: "+err.Error(), "Check your connection and API key")
	}

	usageCmd := "dashboard-cli audit"
	if *user != "" {
		usageCmd += " --user " + *user
	}
	if *action != "" {
		usageCmd += " --action " + *action
	}
	if *resource != "" {
		usageCmd += " --resource " + *resource
	}
	if *last != "" {
		usageCmd += " --last " + *last
	}

	nextCmd := ""
	if page*ps < resp.Total {
		nextCmd = usageCmd + fmt.Sprintf(" --page %d", page+1)
	}

	meta := buildMeta(
		"dashboard-cli audit [--user USER] [--action ACTION] [--resource RESOURCE] [--last RANGE] [--page N] [--head N]",
		len(resp.Logs), resp.Total, page, nextCmd,
	)

	printJSON(map[string]interface{}{
		"meta": meta,
		"logs": resp.Logs,
	})
}

// resolveUserID resolves a user name, email, or UUID to a user_id string.
// If it looks like a UUID, returns as-is. Otherwise fetches user list and matches.
// If resolution fails, returns empty string (no filter applied).
func resolveUserID(c *Client, userFlag string) string {
	// UUID check
	if len(userFlag) == 36 && strings.Contains(userFlag, "-") {
		return userFlag
	}

	// Need a site_id to fetch users — get first available site
	var sites []map[string]interface{}
	if err := c.getJSON("/sites", &sites); err != nil || len(sites) == 0 {
		return ""
	}
	siteID, _ := sites[0]["id"].(string)

	var users []map[string]interface{}
	if err := c.getJSON("/users?site_id="+siteID, &users); err != nil {
		return ""
	}

	lower := strings.ToLower(userFlag)
	for _, u := range users {
		email, _ := u["email"].(string)
		name, _ := u["name"].(string)
		if strings.ToLower(email) == lower || strings.ToLower(name) == lower {
			id, _ := u["id"].(string)
			return id
		}
	}
	return ""
}
