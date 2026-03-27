# LLM-Friendly CLI Design Principles

A reference guide for building CLI tools that serve as the interface between LLM agents and backend systems. These principles assume the consumer is an AI agent with shell access, not a human.

## Core Philosophy

LLMs have limited context windows and no visual UI. A CLI tool for LLMs must:
1. **Never surprise** — output structure is predictable and self-documenting
2. **Never overwhelm** — output fits within a token budget (~1K tokens)
3. **Always guide** — every output tells the LLM what it can do next

## Output Format

### Use XML, Not JSON

XML is better for LLM consumption:
- Clear open/close tags reduce parsing ambiguity
- No trailing comma issues in streaming
- Attributes keep data compact: `<alert id="x" severity="critical"/>` vs `{"id":"x","severity":"critical"}`
- LLMs handle XML natively in most prompting frameworks

### Mandatory `<meta>` Header

Every command output starts with `<meta>`. This is the "control plane" — the LLM reads this first to understand what it got and what to do next.

```xml
<meta>
  <usage>command [flags]</usage>
  <showing>15</showing>
  <total>58</total>
  <remaining>43</remaining>
  <next>command --page 2</next>
</meta>
```

Fields:
- `<usage>` — full flag reference so the LLM learns the command from any output
- `<showing>` — number of records in this response
- `<total>` — total matching records in the system
- `<remaining>` — how many records NOT yet shown (total minus all shown across pages)
- `<next>` — exact command to get the next chunk (absent on last page)

### Token Budget

Target ~1K tokens (~3KB text) per output. This means:
- Auto-calculate page size based on data density (alerts are denser than site lists)
- The CLI controls the budget, not the user
- Dense data (metrics with numbers) → ~10 records per page
- Light data (site names) → ~15-20 records per page

### `--head` Flag

Every command supports `--head N`:
- `--head 0` — meta block only, no data (cheapest way to learn about a command)
- `--head 5` — meta + first 5 lines of data
- No `--head` — full page within token budget

This lets the LLM do progressive discovery:
```bash
dashboard-cli alerts --head 0       # what does this command do? how many alerts?
dashboard-cli alerts --page 1       # ok give me the first page
dashboard-cli alerts --page 2       # more
```

## Progressive Disclosure

### `doc` Command as Entry Point

The tool should have a built-in `doc` command that acts as a discovery tree:

```bash
tool doc              # list all topics
tool doc alerts       # how to query alerts
tool doc alerts filters  # detailed filter options
```

Each `doc` output includes `<see_also>` pointing to deeper topics. The LLM navigates the tree until it has enough context to act.

### Don't Dump Everything

Never return all data. Always paginate. Always tell the LLM what's remaining. The LLM decides whether to fetch more based on its task.

## Error Handling

Errors use the same XML structure with actionable hints:

```xml
<error>
  <message>Site 'factory99' not found</message>
  <hint>Run `dashboard-cli sites` to list available sites</hint>
</error>
```

The `<hint>` is critical — it tells the LLM exactly how to recover.

## Authentication

### Config File + Env Var

```bash
# One-time setup (stored in ~/.tool-config.yaml)
tool configure --url http://server:8080 --api-key dk_xxx

# Or per-command via env
TOOL_URL=http://server:8080 TOOL_API_KEY=dk_xxx tool alerts
```

Config file for persistent setup, env vars for override. This works for all agent runtimes.

### API Keys, Not Sessions

LLM agents can't do OAuth flows. Use static API keys:
- Generated via admin command
- Read-only by default
- Identifiable by prefix (e.g., `dk_`) for easy rotation
- Hashed in database, shown once on creation

## Agent Skill Injection

The CLI should be able to install itself as a skill/tool definition in agent systems:

```bash
tool inject-skill claude-code              # project-level
tool inject-skill claude-code --global     # user-level
tool inject-skill claude-code --target DIR # custom path
```

The skill file teaches the agent:
- What the tool does
- How to start (`tool doc`)
- Common workflows
- Output format expectations

This eliminates the bootstrapping problem — the agent knows the tool exists and how to use it without being told.

## Design Checklist

When building an LLM-friendly CLI:

- [ ] All output is structured (XML recommended)
- [ ] `<meta>` header on every output with usage, pagination, remaining count
- [ ] Token budget enforced (~1K tokens per output)
- [ ] `--head N` flag on every command (`--head 0` for meta only)
- [ ] `doc` command with progressive disclosure tree
- [ ] Errors include `<hint>` with recovery command
- [ ] Config file + env var authentication
- [ ] API keys (not OAuth/sessions)
- [ ] `inject-skill` command for agent system integration
- [ ] Never return unbounded data — always paginate
- [ ] `<remaining>` tells LLM exactly how much it hasn't seen
- [ ] `<next>` gives the exact command for more data
