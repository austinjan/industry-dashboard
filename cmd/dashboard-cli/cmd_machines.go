package main

import (
	"flag"
	"fmt"
)

func runMachines(args []string) {
	fs := flag.NewFlagSet("machines", flag.ExitOnError)
	site := fs.String("site", "", "Site ID or code (required)")

	head, _, remaining := parseCommonFlags(args)
	fs.Parse(remaining)

	if *site == "" {
		printError("--site is required", "dashboard-cli machines --site <ID|code>")
	}

	if head == 0 {
		meta := buildMeta("dashboard-cli machines --site SITE [--head N]", 0, 0, 1, "")
		printJSON(map[string]interface{}{"meta": meta})
		return
	}

	c := newClient()
	siteID := resolveSiteID(c, *site)

	// Fetch lines
	var lines []map[string]interface{}
	if err := c.getJSON(fmt.Sprintf("/sites/%s/lines", siteID), &lines); err != nil {
		printError("Failed to fetch lines: "+err.Error(), "Check your connection and API key")
	}

	// Fetch all machines for the site
	var allMachines []map[string]interface{}
	if err := c.getJSON(fmt.Sprintf("/site-machines?site_id=%s", siteID), &allMachines); err != nil {
		printError("Failed to fetch machines: "+err.Error(), "Check your connection and API key")
	}

	// Build a map of line_id → machines
	machinesByLine := map[string][]map[string]interface{}{}
	for _, m := range allMachines {
		lineID, _ := m["line_id"].(string)
		machine := map[string]interface{}{
			"id":     m["id"],
			"name":   m["name"],
			"model":  m["model"],
			"status": m["status"],
		}
		machinesByLine[lineID] = append(machinesByLine[lineID], machine)
	}

	// Get site name
	var siteObj map[string]interface{}
	siteName := *site
	if err := c.getJSON(fmt.Sprintf("/sites/%s", siteID), &siteObj); err == nil {
		if n, ok := siteObj["name"].(string); ok {
			siteName = n
		}
	}

	// Build output
	totalMachines := 0
	lineOutput := make([]map[string]interface{}, 0, len(lines))
	for _, l := range lines {
		lineID, _ := l["id"].(string)
		machines := machinesByLine[lineID]
		if machines == nil {
			machines = []map[string]interface{}{}
		}

		// Apply head limit
		if head > 0 && totalMachines+len(machines) > head {
			remaining := head - totalMachines
			if remaining <= 0 {
				break
			}
			machines = machines[:remaining]
		}
		totalMachines += len(machines)

		lineOutput = append(lineOutput, map[string]interface{}{
			"id":       lineID,
			"name":     l["name"],
			"machines": machines,
		})

		if head > 0 && totalMachines >= head {
			break
		}
	}

	meta := buildMeta(
		"dashboard-cli machines --site SITE [--head N]",
		totalMachines, len(allMachines), 1, "",
	)

	printJSON(map[string]interface{}{
		"meta":  meta,
		"site":  siteName,
		"lines": lineOutput,
	})
}
