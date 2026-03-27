package main

import (
	"flag"
	"fmt"
)

func runSites(args []string) {
	fs := flag.NewFlagSet("sites", flag.ExitOnError)
	fs.Parse(args)

	head, _, _ := parseCommonFlags(args)

	if head == 0 {
		meta := buildMeta("dashboard-cli sites [--head N]", 0, 0, 1, "")
		printJSON(map[string]interface{}{"meta": meta})
		return
	}

	c := newClient()

	var sites []map[string]interface{}
	if err := c.getJSON("/sites", &sites); err != nil {
		printError("Failed to list sites: "+err.Error(), "Check your connection and API key")
	}

	limit := len(sites)
	if head > 0 && head < limit {
		limit = head
	}

	result := make([]map[string]interface{}, 0, limit)
	for i := 0; i < limit; i++ {
		site := sites[i]
		id, _ := site["id"].(string)

		var summary map[string]interface{}
		if err := c.getJSON(fmt.Sprintf("/sites/%s/summary", id), &summary); err != nil {
			summary = map[string]interface{}{}
		}

		entry := map[string]interface{}{
			"id":       id,
			"name":     site["name"],
			"code":     site["code"],
			"timezone": site["timezone"],
		}
		for _, k := range []string{"total_machines", "online_machines", "active_alerts", "total_lines"} {
			if v, ok := summary[k]; ok {
				entry[k] = v
			}
		}
		result = append(result, entry)
	}

	meta := buildMeta("dashboard-cli sites [--head N]", len(result), len(sites), 1, "")
	printJSON(map[string]interface{}{
		"meta":  meta,
		"sites": result,
	})
}
