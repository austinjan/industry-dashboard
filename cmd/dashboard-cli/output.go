package main

import (
	"encoding/json"
	"fmt"
	"os"
)

const maxTokenBudget = 1000
const metaTokenBudget = 150

func printJSON(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}

func printError(message, hint string) {
	printJSON(map[string]interface{}{
		"error": map[string]string{
			"message": message,
			"hint":    hint,
		},
	})
	os.Exit(1)
}

// pageSize calculates how many records fit in the token budget
func pageSize(perRecordTokens int) int {
	available := maxTokenBudget - metaTokenBudget
	size := available / perRecordTokens
	if size < 5 {
		size = 5
	}
	if size > 20 {
		size = 20
	}
	return size
}

// buildMeta constructs the meta object for paginated responses
func buildMeta(usage string, showing, total, page int, nextCmd string) map[string]interface{} {
	allShown := page*pageSize(50) + showing // rough estimate of total shown so far
	remaining := total - allShown
	if remaining < 0 {
		remaining = 0
	}
	meta := map[string]interface{}{
		"usage":     usage,
		"showing":   showing,
		"total":     total,
		"remaining": remaining,
	}
	if remaining > 0 && nextCmd != "" {
		meta["next"] = nextCmd
	}
	return meta
}

// parseCommonFlags extracts --head and --page from args, returns (head, page, remaining args)
// head = -1 means not set (full page)
func parseCommonFlags(args []string) (head int, page int, remaining []string) {
	head = -1
	page = 1
	remaining = make([]string, 0)
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--head":
			if i+1 < len(args) {
				fmt.Sscanf(args[i+1], "%d", &head)
				i++
			}
		case "--page":
			if i+1 < len(args) {
				fmt.Sscanf(args[i+1], "%d", &page)
				i++
			}
		default:
			remaining = append(remaining, args[i])
		}
	}
	return
}
