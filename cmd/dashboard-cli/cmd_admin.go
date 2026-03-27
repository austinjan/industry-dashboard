package main

import (
	"encoding/json"
	"flag"
)

func runAdmin(args []string) {
	if len(args) == 0 {
		printError("Admin subcommand required", "dashboard-cli admin create-key|list-keys|revoke-key")
		return
	}
	subcmd := args[0]
	subargs := args[1:]
	switch subcmd {
	case "create-key":
		runAdminCreateKey(subargs)
	case "list-keys":
		runAdminListKeys(subargs)
	case "revoke-key":
		runAdminRevokeKey(subargs)
	default:
		printError("Unknown admin command: "+subcmd, "dashboard-cli admin create-key|list-keys|revoke-key")
	}
}

func runAdminCreateKey(args []string) {
	fs := flag.NewFlagSet("create-key", flag.ExitOnError)
	name := fs.String("name", "", "Name for the API key")
	fs.Parse(args)

	if *name == "" {
		printError("--name is required", "dashboard-cli admin create-key --name KEY_NAME")
		return
	}

	c := newClient()
	respBody, err := c.post("/llm/keys", map[string]string{"name": *name})
	if err != nil {
		printError("Failed to create API key: "+err.Error(), "Check your admin permissions")
		return
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		printError("Failed to parse response: "+err.Error(), "Unexpected server response")
		return
	}

	printJSON(map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli admin create-key --name NAME",
			"tip":   "Store this API key securely — it will not be shown again",
		},
		"result": result,
	})
}

func runAdminListKeys(args []string) {
	_ = args
	c := newClient()

	var keys interface{}
	if err := c.getJSON("/llm/keys", &keys); err != nil {
		printError("Failed to list API keys: "+err.Error(), "Check your admin permissions")
		return
	}

	printJSON(map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli admin list-keys",
		},
		"result": keys,
	})
}

func runAdminRevokeKey(args []string) {
	fs := flag.NewFlagSet("revoke-key", flag.ExitOnError)
	id := fs.String("id", "", "ID of the API key to revoke")
	fs.Parse(args)

	if *id == "" {
		printError("--id is required", "dashboard-cli admin revoke-key --id KEY_ID")
		return
	}

	c := newClient()
	if err := c.delete("/llm/keys/" + *id); err != nil {
		printError("Failed to revoke API key: "+err.Error(), "Check the key ID and your admin permissions")
		return
	}

	printJSON(map[string]interface{}{
		"meta": map[string]string{
			"usage": "dashboard-cli admin revoke-key --id ID",
		},
		"result": map[string]string{
			"message": "API key " + *id + " has been revoked",
		},
	})
}
