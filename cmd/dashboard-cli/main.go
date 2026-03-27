package main

import (
	"fmt"
	"os"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "configure":
		runConfigure(args)
	case "doc":
		runDoc(args)
	case "sites":
		runSites(args)
	case "alerts":
		runAlerts(args)
	case "alert-rules":
		runAlertRules(args)
	case "audit":
		runAudit(args)
	case "machines":
		runMachines(args)
	case "metrics":
		runMetrics(args)
	case "workers":
		runWorkers(args)
	case "admin":
		runAdmin(args)
	case "inject-skill":
		runInjectSkill(args)
	case "version":
		fmt.Printf(`{"version":"%s"}`, version)
		fmt.Println()
	default:
		fmt.Fprintf(os.Stderr, `{"error":{"message":"Unknown command: %s","hint":"Run 'dashboard-cli' to see available commands"}}`, cmd)
		fmt.Fprintln(os.Stderr)
		os.Exit(1)
	}
}

func printUsage() {
	output := map[string]interface{}{
		"meta": map[string]interface{}{
			"usage": "dashboard-cli <command> [flags]",
			"commands": []string{
				"configure    — Set up server URL and API key",
				"doc          — Progressive disclosure documentation",
				"sites        — List sites with summaries",
				"alerts       — Query alert events",
				"alert-rules  — View alert rule configurations",
				"audit        — Query audit trail",
				"machines     — Machine status and hierarchy",
				"metrics      — Time-series data and latest values",
				"workers      — Worker fleet status",
				"admin        — API key management",
				"inject-skill — Install agent skill file",
				"version      — Show CLI version",
			},
			"tip": "Run 'dashboard-cli doc' to learn how to use each command",
		},
	}
	printJSON(output)
}
