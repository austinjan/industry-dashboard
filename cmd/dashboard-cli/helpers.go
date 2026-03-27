package main

import (
	"strings"
	"time"
)

// resolveSiteID resolves a site code or UUID to a site UUID.
// If the flag value looks like a UUID, it is returned as-is.
// Otherwise, the sites list is fetched and the code is matched.
func resolveSiteID(c *Client, siteFlag string) string {
	if len(siteFlag) == 36 && strings.Contains(siteFlag, "-") {
		return siteFlag
	}
	var sites []map[string]interface{}
	if err := c.getJSON("/sites", &sites); err != nil {
		printError("Failed to list sites: "+err.Error(), "Check your connection and API key")
	}
	for _, s := range sites {
		if s["code"] == siteFlag {
			id, _ := s["id"].(string)
			return id
		}
	}
	printError("Site not found: "+siteFlag, "Run 'dashboard-cli sites' to list available sites")
	return ""
}

// parseLast converts a shorthand duration string (e.g. "1h", "7d") to an RFC3339
// timestamp representing that duration ago from now.
func parseLast(last string) string {
	if last == "" {
		return ""
	}
	dur := map[string]time.Duration{
		"1h":  time.Hour,
		"6h":  6 * time.Hour,
		"24h": 24 * time.Hour,
		"3d":  72 * time.Hour,
		"7d":  168 * time.Hour,
		"30d": 720 * time.Hour,
	}
	d, ok := dur[last]
	if !ok {
		printError("Invalid --last value: "+last, "Use: 1h, 6h, 24h, 3d, 7d, 30d")
	}
	return time.Now().Add(-d).Format(time.RFC3339)
}
