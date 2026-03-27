---
name: dashboard-cli
description: Query industry monitoring dashboard for alerts, audit logs, machine status, metrics, and worker information
---

You have access to `dashboard-cli` for querying the industry monitoring dashboard.

Start with `dashboard-cli doc` to discover available commands. Use `dashboard-cli doc <topic>` for details on a specific area.

All output is JSON. The `"meta"` field always comes first with usage, pagination, and tips. Use `--head 0` to read meta only (cheapest way to learn about a command).

When investigating issues:
1. `dashboard-cli alerts --site ID --status open` — check active alerts
2. `dashboard-cli audit --last 24h` — recent system changes
3. `dashboard-cli machines --site ID` — machine health overview
4. `dashboard-cli metrics --machine ID` — latest sensor readings

Common workflows:
- Find open critical alerts: `dashboard-cli alerts --site SITE --severity critical --status open`
- Check what a user did: `dashboard-cli audit --user NAME --last 7d`
- Get machine sensor data: `dashboard-cli metrics --machine ID --metric temperature --last 1h`
- Overview of all sites: `dashboard-cli sites`
