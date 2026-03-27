package main

import (
	_ "embed"
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

//go:embed skills/claude-code.md
var claudeCodeSkill string

func runInjectSkill(args []string) {
	if len(args) == 0 {
		printError("Agent type required", "dashboard-cli inject-skill claude-code [--global] [--target DIR]")
		return
	}

	agent := args[0]
	fs := flag.NewFlagSet("inject-skill", flag.ExitOnError)
	global := fs.Bool("global", false, "Install to global user config")
	target := fs.String("target", "", "Custom target directory")
	fs.Parse(args[1:])

	var skillContent string
	var skillDir string

	switch agent {
	case "claude-code":
		skillContent = claudeCodeSkill
		if *target != "" {
			skillDir = filepath.Join(*target, ".claude", "skills")
		} else if *global {
			home, _ := os.UserHomeDir()
			skillDir = filepath.Join(home, ".claude", "skills")
		} else {
			skillDir = filepath.Join(".claude", "skills")
		}
	default:
		printError("Unknown agent: "+agent, "Supported: claude-code")
		return
	}

	os.MkdirAll(skillDir, 0755)
	path := filepath.Join(skillDir, "dashboard-cli.md")
	if err := os.WriteFile(path, []byte(skillContent), 0644); err != nil {
		printError("Failed to write skill file: "+err.Error(), "Check directory permissions")
		return
	}

	printJSON(map[string]interface{}{
		"meta":   map[string]string{"usage": "dashboard-cli inject-skill claude-code [--global] [--target DIR]"},
		"result": fmt.Sprintf("Skill file written to %s", path),
		"tip":    "The agent will now discover dashboard-cli automatically",
	})
}
