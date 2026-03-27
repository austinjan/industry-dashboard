package main

func runWorkers(args []string) {
	head, _, _ := parseCommonFlags(args)

	if head == 0 {
		meta := buildMeta("dashboard-cli workers [--head N]", 0, 0, 1, "")
		printJSON(map[string]interface{}{"meta": meta})
		return
	}

	c := newClient()

	var workers []map[string]interface{}
	if err := c.getJSON("/workers", &workers); err != nil {
		printError("Failed to fetch workers: "+err.Error(), "Check your connection and API key")
	}

	limit := len(workers)
	if head > 0 && head < limit {
		limit = head
	}
	workers = workers[:limit]

	meta := buildMeta(
		"dashboard-cli workers [--head N]",
		len(workers), len(workers), 1, "",
	)

	printJSON(map[string]interface{}{
		"meta":    meta,
		"workers": workers,
	})
}
