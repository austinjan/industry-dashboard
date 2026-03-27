package main

import (
	"flag"
	"fmt"
	"sort"
)

func runMetrics(args []string) {
	fs := flag.NewFlagSet("metrics", flag.ExitOnError)
	machine := fs.String("machine", "", "Machine ID (required)")
	metric := fs.String("metric", "", "Metric name for time-series query")
	last := fs.String("last", "", "Time range: 1h, 6h, 24h, 7d, 30d (use with --metric)")

	head, _, remaining := parseCommonFlags(args)
	fs.Parse(remaining)

	if *machine == "" {
		printError("--machine is required", "dashboard-cli metrics --machine <MACHINE_ID>")
	}

	machineID := *machine

	if *metric != "" {
		// Time-series query
		timeRange := *last
		if timeRange == "" {
			timeRange = "1h"
		}

		if head == 0 {
			meta := buildMeta("dashboard-cli metrics --machine MACHINE --metric METRIC [--last RANGE] [--head N]", 0, 0, 1, "")
			printJSON(map[string]interface{}{
				"meta":       meta,
				"machine_id": machineID,
				"metric":     *metric,
				"range":      timeRange,
			})
			return
		}

		c := newClient()
		query := fmt.Sprintf("/datapoints?machine_id=%s&metric=%s&range=%s", machineID, *metric, timeRange)
		var points []map[string]interface{}
		if err := c.getJSON(query, &points); err != nil {
			printError("Failed to fetch time-series data: "+err.Error(), "Check your connection and API key")
		}

		limit := len(points)
		if head > 0 && head < limit {
			limit = head
		}
		points = points[:limit]

		meta := buildMeta(
			"dashboard-cli metrics --machine MACHINE --metric METRIC [--last RANGE] [--head N]",
			len(points), len(points), 1, "",
		)
		printJSON(map[string]interface{}{
			"meta":       meta,
			"machine_id": machineID,
			"metric":     *metric,
			"range":      timeRange,
			"points":     points,
		})
		return
	}

	// Latest values query
	if head == 0 {
		meta := buildMeta("dashboard-cli metrics --machine MACHINE [--metric METRIC --last RANGE] [--head N]", 0, 0, 1, "")
		printJSON(map[string]interface{}{
			"meta":       meta,
			"machine_id": machineID,
		})
		return
	}

	c := newClient()
	var latest map[string]float64
	if err := c.getJSON(fmt.Sprintf("/machines/%s/latest", machineID), &latest); err != nil {
		printError("Failed to fetch latest values: "+err.Error(), "Check your connection and API key")
	}

	// Sort metric names for stable output
	names := make([]string, 0, len(latest))
	for k := range latest {
		names = append(names, k)
	}
	sort.Strings(names)

	metrics := make([]map[string]interface{}, 0, len(names))
	for _, name := range names {
		metrics = append(metrics, map[string]interface{}{
			"name":  name,
			"value": latest[name],
		})
	}

	limit := len(metrics)
	if head > 0 && head < limit {
		limit = head
	}
	metrics = metrics[:limit]

	meta := buildMeta(
		"dashboard-cli metrics --machine MACHINE [--metric METRIC --last RANGE] [--head N]",
		len(metrics), len(metrics), 1, "",
	)
	printJSON(map[string]interface{}{
		"meta":       meta,
		"machine_id": machineID,
		"metrics":    metrics,
	})
}
