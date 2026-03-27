# LLM Integration (dashboard-cli) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Go CLI binary that gives LLM agents shell-based access to the industry dashboard with XML output, token budgeting, and progressive disclosure.

**Architecture:** Smart CLI client (`cmd/dashboard-cli/`) calls existing REST APIs, formats to XML. Backend adds API key auth (new `llm_api_keys` table, middleware extension). CLI uses standard `flag` package with subcommand dispatch (consistent with existing `cmd/fake-worker/`).

**Tech Stack:** Go, standard `flag` package, `gopkg.in/yaml.v3`, `golang.org/x/crypto/bcrypt`, existing REST API endpoints

**Spec:** `docs/superpowers/specs/2026-03-27-llm-integration-design.md`

---

## File Structure

### Backend (new/modified)
| File | Action | Responsibility |
|------|--------|---------------|
| `migrations/021_create_llm_api_keys.up.sql` | Create | API keys table |
| `migrations/021_create_llm_api_keys.down.sql` | Create | Rollback |
| `internal/llmauth/store.go` | Create | CRUD for llm_api_keys |
| `internal/llmauth/handler.go` | Create | Key management HTTP handlers |
| `internal/auth/middleware.go` | Modify | Accept `dk_` API keys alongside JWT |
| `internal/rbac/middleware.go` | Modify | Bypass RBAC for `llm:` users (read-only) |
| `internal/audit/store.go` | Modify | Add `Since` filter to ListParams |
| `internal/audit/handler.go` | Modify | Pass `since` query param |
| `internal/alert/store.go` | Modify | Add `Since` filter to AlertEventListParams |
| `internal/alert/handler.go` | Modify | Pass `since` query param |
| `cmd/server/main.go` | Modify | Wire llmauth store/handler, register `/api/llm/keys` routes, bootstrap key |

### CLI (all new)
| File | Action | Responsibility |
|------|--------|---------------|
| `cmd/dashboard-cli/main.go` | Create | Entry point, subcommand dispatch |
| `cmd/dashboard-cli/config.go` | Create | `configure` command, YAML read/write |
| `cmd/dashboard-cli/client.go` | Create | HTTP client with API key auth, error handling |
| `cmd/dashboard-cli/output.go` | Create | XML formatting, `<meta>` generation, token budget |
| `cmd/dashboard-cli/cmd_doc.go` | Create | `doc` command with topic tree |
| `cmd/dashboard-cli/cmd_sites.go` | Create | `sites` command |
| `cmd/dashboard-cli/cmd_alerts.go` | Create | `alerts` command |
| `cmd/dashboard-cli/cmd_alert_rules.go` | Create | `alert-rules` command |
| `cmd/dashboard-cli/cmd_audit.go` | Create | `audit` command |
| `cmd/dashboard-cli/cmd_machines.go` | Create | `machines` command |
| `cmd/dashboard-cli/cmd_metrics.go` | Create | `metrics` command |
| `cmd/dashboard-cli/cmd_workers.go` | Create | `workers` command |
| `cmd/dashboard-cli/cmd_admin.go` | Create | `admin` key management commands |
| `cmd/dashboard-cli/cmd_inject_skill.go` | Create | `inject-skill` command |
| `cmd/dashboard-cli/skills/claude-code.md` | Create | Embedded skill template |

---

## Phase 1: Backend — API Key Auth

### Task 1: Migration for llm_api_keys table

**Files:**
- Create: `migrations/021_create_llm_api_keys.up.sql`
- Create: `migrations/021_create_llm_api_keys.down.sql`

- [ ] **Step 1: Create up migration**

```sql
CREATE TABLE llm_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_llm_api_keys_prefix ON llm_api_keys(key_prefix);
```

- [ ] **Step 2: Create down migration**

```sql
DROP TABLE IF EXISTS llm_api_keys;
```

- [ ] **Step 3: Run migration**

Run: `make migrate`

- [ ] **Step 4: Commit**

```bash
git add migrations/021_*
git commit -m "feat: add llm_api_keys migration"
```

---

### Task 2: LLM auth store — key CRUD

**Files:**
- Create: `internal/llmauth/store.go`

- [ ] **Step 1: Create the store**

```go
package llmauth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type APIKey struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	KeyPrefix string    `json:"key_prefix"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func GenerateKey() (fullKey string, prefix string, hash string, err error) {
	bytes := make([]byte, 32)
	if _, err = rand.Read(bytes); err != nil {
		return
	}
	fullKey = "dk_" + hex.EncodeToString(bytes)
	prefix = fullKey[:8]
	hashed, err := bcrypt.GenerateFromPassword([]byte(fullKey), bcrypt.DefaultCost)
	if err != nil {
		return
	}
	hash = string(hashed)
	return
}

func (s *Store) Create(ctx context.Context, name string) (*APIKey, string, error) {
	fullKey, prefix, hash, err := GenerateKey()
	if err != nil {
		return nil, "", err
	}
	var key APIKey
	err = s.db.QueryRow(ctx,
		`INSERT INTO llm_api_keys (name, key_hash, key_prefix)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, key_prefix, is_active, created_at`,
		name, hash, prefix,
	).Scan(&key.ID, &key.Name, &key.KeyPrefix, &key.IsActive, &key.CreatedAt)
	if err != nil {
		return nil, "", err
	}
	return &key, fullKey, nil
}

func (s *Store) ValidateKey(ctx context.Context, fullKey string) (*APIKey, error) {
	prefix := fullKey[:8]
	var key APIKey
	var hash string
	err := s.db.QueryRow(ctx,
		`SELECT id, name, key_hash, key_prefix, is_active, created_at
		 FROM llm_api_keys WHERE key_prefix = $1 AND is_active = true`,
		prefix,
	).Scan(&key.ID, &key.Name, &hash, &key.KeyPrefix, &key.IsActive, &key.CreatedAt)
	if err != nil {
		return nil, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(fullKey)); err != nil {
		return nil, err
	}
	return &key, nil
}

func (s *Store) List(ctx context.Context) ([]APIKey, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, key_prefix, is_active, created_at
		 FROM llm_api_keys ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := make([]APIKey, 0)
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.Name, &k.KeyPrefix, &k.IsActive, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, rows.Err()
}

func (s *Store) Revoke(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE llm_api_keys SET is_active = false WHERE id = $1`, id)
	return err
}

func (s *Store) HasAnyKey(ctx context.Context) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM llm_api_keys)`).Scan(&exists)
	return exists, err
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`

- [ ] **Step 3: Commit**

```bash
git add internal/llmauth/store.go
git commit -m "feat(llmauth): add API key store with create, validate, list, revoke"
```

---

### Task 3: LLM auth handler — key management endpoints

**Files:**
- Create: `internal/llmauth/handler.go`

- [ ] **Step 1: Create the handler**

```go
package llmauth

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) CreateKey(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	key, fullKey, err := h.store.Create(r.Context(), body.Name)
	if err != nil {
		http.Error(w, "failed to create key", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":     key,
		"api_key": fullKey,
		"warning": "Store this key securely. It will not be shown again.",
	})
}

func (h *Handler) ListKeys(w http.ResponseWriter, r *http.Request) {
	keys, err := h.store.List(r.Context())
	if err != nil {
		http.Error(w, "failed to list keys", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys)
}

func (h *Handler) RevokeKey(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "keyID")
	if err := h.store.Revoke(r.Context(), id); err != nil {
		http.Error(w, "failed to revoke key", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`

- [ ] **Step 3: Commit**

```bash
git add internal/llmauth/handler.go
git commit -m "feat(llmauth): add key management handlers"
```

---

### Task 4: Extend auth middleware for API keys

**Files:**
- Modify: `internal/auth/middleware.go`

- [ ] **Step 1: Read the existing middleware**

Read `internal/auth/middleware.go` to see the current `Authenticate` method.

- [ ] **Step 2: Add API key support**

The middleware needs a reference to the llmauth store. Add a field `apiKeyStore` and a setter. In `Authenticate()`, before JWT validation, check if the token starts with `dk_`. If so, validate against the store and create synthetic claims.

Key changes:
- Add `SetAPIKeyStore(store)` method to the `Middleware` struct
- In `Authenticate()`, after extracting the token string, check `strings.HasPrefix(token, "dk_")`
- If API key: validate via `apiKeyStore.ValidateKey()`, create Claims with `UserID: "llm:" + key.Name`, `Email: "llm:" + key.Name + "@api"`, `TokenType: "api_key"`
- If JWT: continue with existing flow

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`

- [ ] **Step 4: Commit**

```bash
git add internal/auth/middleware.go
git commit -m "feat(auth): extend middleware to accept dk_ API keys"
```

---

### Task 5: RBAC bypass for LLM users

**Files:**
- Modify: `internal/rbac/middleware.go`

- [ ] **Step 1: Add LLM bypass**

In the `Require()` method, after getting claims, check if `claims.UserID` starts with `"llm:"`. If so, skip the permission check and call `next.ServeHTTP(w, r)` directly. This grants all read access to API key users (write methods are already blocked by the auth middleware's read-only check).

```go
// After getting claims
if strings.HasPrefix(claims.UserID, "llm:") {
    next.ServeHTTP(w, r)
    return
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`

- [ ] **Step 3: Commit**

```bash
git add internal/rbac/middleware.go
git commit -m "feat(rbac): bypass permission checks for LLM API key users"
```

---

### Task 6: Add `since` filter to audit and alert-events

**Files:**
- Modify: `internal/audit/store.go` — add `Since` to ListParams, filter in query
- Modify: `internal/audit/handler.go` — parse `since` query param
- Modify: `internal/alert/store.go` — add `Since` to AlertEventListParams, filter in query
- Modify: `internal/alert/handler.go` — parse `since` query param

- [ ] **Step 1: Add Since to audit ListParams and query**

In `internal/audit/store.go`, add `Since time.Time` to `ListParams`. In `List()`, after existing filters add:

```go
if !params.Since.IsZero() {
    query += ` AND al.timestamp >= $` + strconv.Itoa(argIdx)
    args = append(args, params.Since)
    argIdx++
}
```

Also add a total count query (same pattern as alert store's `AlertEventListResult`):
- Run `SELECT COUNT(*)` with same filters before the main query
- Return a struct `AuditListResult { Logs []AuditLog, Total int }`

- [ ] **Step 2: Update audit handler to parse `since`**

In `internal/audit/handler.go`, parse `since` query param as RFC3339 time:

```go
if sinceStr := r.URL.Query().Get("since"); sinceStr != "" {
    if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
        params.Since = t
    }
}
```

Update response to encode the result struct (with total).

- [ ] **Step 3: Add Since to AlertEventListParams and query**

In `internal/alert/store.go`, add `Since time.Time` to `AlertEventListParams`. In `ListAlertEvents()`, add:

```go
if !p.Since.IsZero() {
    baseFrom += ` AND ae.triggered_at >= $` + strconv.Itoa(argIdx)
    args = append(args, p.Since)
    argIdx++
}
```

- [ ] **Step 4: Update alert handler to parse `since`**

In `internal/alert/handler.go`, parse `since` query param same as audit.

- [ ] **Step 5: Verify compilation**

Run: `go build ./...`

- [ ] **Step 6: Commit**

```bash
git add internal/audit/ internal/alert/
git commit -m "feat: add since filter to audit logs and alert events"
```

---

### Task 7: Wire everything in main.go + bootstrap key

**Files:**
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Add llmauth initialization and routes**

After existing store/handler initialization (around line 70), add:

```go
llmKeyStore := llmauth.NewStore(pool)
llmKeyHandler := llmauth.NewHandler(llmKeyStore)
authMW.SetAPIKeyStore(llmKeyStore)
```

Register routes (inside the `/api` protected group):

```go
r.Route("/llm/keys", func(r chi.Router) {
    r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Get("/", llmKeyHandler.ListKeys)
    r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Post("/", llmKeyHandler.CreateKey)
    r.With(rbacMW.Require("role:manage", rbac.SiteFromQuery)).Delete("/{keyID}", llmKeyHandler.RevokeKey)
})
```

- [ ] **Step 2: Add bootstrap key logic**

At startup, after pool creation, check `DASHBOARD_BOOTSTRAP_KEY` env var:

```go
if os.Getenv("DASHBOARD_BOOTSTRAP_KEY") == "true" {
    hasKey, _ := llmKeyStore.HasAnyKey(context.Background())
    if !hasKey {
        key, fullKey, err := llmKeyStore.Create(context.Background(), "bootstrap")
        if err == nil {
            log.Printf("[BOOTSTRAP] API key created: %s", fullKey)
            log.Printf("[BOOTSTRAP] Key name: %s, prefix: %s", key.Name, key.KeyPrefix)
        }
    }
}
```

- [ ] **Step 3: Verify compilation and test**

Run: `go build ./...`

- [ ] **Step 4: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat: wire llm auth store/handler, add bootstrap key"
```

---

## Phase 2: CLI Binary — Core Infrastructure

### Task 8: CLI entry point and subcommand dispatch

**Files:**
- Create: `cmd/dashboard-cli/main.go`

- [ ] **Step 1: Create main.go with subcommand routing**

```go
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
		fmt.Printf("dashboard-cli %s\n", version)
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`<meta>
  <usage>dashboard-cli <command> [flags]</usage>
  <commands>
    configure    — Set up server URL and API key
    doc          — Progressive disclosure documentation
    sites        — List sites with summaries
    alerts       — Query alert events
    alert-rules  — View alert rule configurations
    audit        — Query audit trail
    machines     — Machine status and hierarchy
    metrics      — Time-series data and latest values
    workers      — Worker fleet status
    admin        — API key management
    inject-skill — Install agent skill file
    version      — Show CLI version
  </commands>
  <tip>Run 'dashboard-cli doc' to learn how to use each command</tip>
</meta>`)
}
```

- [ ] **Step 2: Add Makefile target**

Add to `Makefile`:

```makefile
dashboard-cli:
	go build -ldflags "-X main.version=$$(git describe --tags --always --dirty 2>/dev/null || echo dev)" -o bin/dashboard-cli ./cmd/dashboard-cli
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./cmd/dashboard-cli`

- [ ] **Step 4: Commit**

```bash
git add cmd/dashboard-cli/main.go Makefile
git commit -m "feat: add dashboard-cli entry point with subcommand dispatch"
```

---

### Task 9: Config management

**Files:**
- Create: `cmd/dashboard-cli/config.go`

- [ ] **Step 1: Create config.go**

Handles `~/.dashboard-cli.yaml` read/write and env var overrides.

```go
package main

import (
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"gopkg.in/yaml.v3"
)

type Config struct {
	URL    string `yaml:"url"`
	APIKey string `yaml:"api_key"`
}

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".dashboard-cli.yaml")
}

func loadConfig() (*Config, error) {
	cfg := &Config{}

	// Read file
	data, err := os.ReadFile(configPath())
	if err == nil {
		yaml.Unmarshal(data, cfg)
	}

	// Env var overrides
	if v := os.Getenv("DASHBOARD_URL"); v != "" {
		cfg.URL = v
	}
	if v := os.Getenv("DASHBOARD_API_KEY"); v != "" {
		cfg.APIKey = v
	}

	if cfg.URL == "" || cfg.APIKey == "" {
		return nil, fmt.Errorf("not configured. Run: dashboard-cli configure --url URL --api-key KEY")
	}
	return cfg, nil
}

func runConfigure(args []string) {
	fs := flag.NewFlagSet("configure", flag.ExitOnError)
	url := fs.String("url", "", "Dashboard server URL (e.g. http://localhost:8080)")
	apiKey := fs.String("api-key", "", "API key (dk_...)")
	fs.Parse(args)

	if *url == "" || *apiKey == "" {
		fmt.Println(`<error>
  <message>Both --url and --api-key are required</message>
  <hint>dashboard-cli configure --url http://localhost:8080 --api-key dk_xxx</hint>
</error>`)
		os.Exit(1)
	}

	// Validate connection
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(*url + "/healthz")
	if err != nil || resp.StatusCode != 200 {
		fmt.Printf(`<error>
  <message>Cannot connect to %s</message>
  <hint>Verify the server is running and the URL is correct</hint>
</error>`, *url)
		os.Exit(1)
	}

	cfg := Config{URL: *url, APIKey: *apiKey}
	data, _ := yaml.Marshal(cfg)
	os.WriteFile(configPath(), data, 0600)

	fmt.Printf(`<meta>
  <usage>dashboard-cli configure --url URL --api-key KEY</usage>
</meta>
<result>
  <message>Configuration saved to %s</message>
  <tip>Run 'dashboard-cli sites' to verify</tip>
</result>
`, configPath())
}
```

- [ ] **Step 2: Add yaml dependency**

Run: `go get gopkg.in/yaml.v3`

- [ ] **Step 3: Verify compilation**

Run: `go build ./cmd/dashboard-cli`

- [ ] **Step 4: Commit**

```bash
git add cmd/dashboard-cli/config.go go.mod go.sum
git commit -m "feat: add dashboard-cli config management with yaml and env vars"
```

---

### Task 10: HTTP client and XML output formatter

**Files:**
- Create: `cmd/dashboard-cli/client.go`
- Create: `cmd/dashboard-cli/output.go`

- [ ] **Step 1: Create client.go**

HTTP client that adds API key auth header, handles errors.

```go
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type Client struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func newClient() *Client {
	cfg, err := loadConfig()
	if err != nil {
		fmt.Printf(`<error>
  <message>%s</message>
  <hint>Run: dashboard-cli configure --url URL --api-key KEY</hint>
</error>
`, err)
		os.Exit(1)
	}
	return &Client{
		baseURL: cfg.URL,
		apiKey:  cfg.APIKey,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *Client) get(path string) ([]byte, error) {
	req, err := http.NewRequest("GET", c.baseURL+"/api"+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}
	return body, nil
}

func (c *Client) getJSON(path string, v interface{}) error {
	data, err := c.get(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

func (c *Client) post(path string, body interface{}) ([]byte, error) {
	var bodyReader io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		bodyReader = io.NopCloser(io.Reader(nil))
		_ = data
		// Simple implementation: encode to JSON
		import_buf := new(bytes.Buffer)
		json.NewEncoder(import_buf).Encode(body)
		bodyReader = import_buf
	}
	req, err := http.NewRequest("POST", c.baseURL+"/api"+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}
	return respBody, nil
}
```

**Note:** The implementer should clean up the `post` method — the above has a rough sketch. Use `bytes.Buffer` + `json.NewEncoder` properly.

- [ ] **Step 2: Create output.go**

XML formatting with `<meta>` generation and token budget.

```go
package main

import (
	"encoding/xml"
	"fmt"
	"os"
	"strings"
)

type Meta struct {
	Usage     string `xml:"usage"`
	Showing   int    `xml:"showing"`
	Total     int    `xml:"total"`
	Remaining int    `xml:"remaining"`
	Next      string `xml:"next,omitempty"`
}

// estimateTokens roughly estimates token count (~4 chars per token)
func estimateTokens(s string) int {
	return len(s) / 4
}

const maxTokenBudget = 1000
const metaTokenBudget = 150

func printMeta(m Meta) {
	fmt.Printf(`<meta>
  <usage>%s</usage>
  <showing>%d</showing>
  <total>%d</total>
  <remaining>%d</remaining>
`, xmlEscape(m.Usage), m.Showing, m.Total, m.Remaining)
	if m.Next != "" {
		fmt.Printf("  <next>%s</next>\n", xmlEscape(m.Next))
	}
	fmt.Println("</meta>")
}

func printError(message, hint string) {
	fmt.Printf(`<error>
  <message>%s</message>
  <hint>%s</hint>
</error>
`, xmlEscape(message), xmlEscape(hint))
	os.Exit(1)
}

func xmlEscape(s string) string {
	var b strings.Builder
	xml.EscapeText(&b, []byte(s))
	return b.String()
}

// pageSize calculates how many records fit in the token budget
// given an estimated per-record token cost
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

// parseHeadFlag extracts --head N from args, returns (headN, remaining args)
// headN = -1 means not set (show full page)
func parseHeadFlag(args []string) (int, []string) {
	for i, a := range args {
		if a == "--head" && i+1 < len(args) {
			n := 0
			fmt.Sscanf(args[i+1], "%d", &n)
			remaining := append(args[:i], args[i+2:]...)
			return n, remaining
		}
	}
	return -1, args
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./cmd/dashboard-cli`

- [ ] **Step 4: Commit**

```bash
git add cmd/dashboard-cli/client.go cmd/dashboard-cli/output.go
git commit -m "feat: add dashboard-cli HTTP client and XML output formatter"
```

---

### Task 11: Doc command — progressive disclosure

**Files:**
- Create: `cmd/dashboard-cli/cmd_doc.go`

- [ ] **Step 1: Create cmd_doc.go**

Built-in topic tree, no API calls. Each topic outputs XML with `<meta>` and `<see_also>`.

The implementer should create a map of topic → content, with a root listing all topics. Each topic explains the command, its flags, and example usage. Include `<see_also>` tags pointing to sub-topics or related commands.

Example structure:
```go
var docTopics = map[string]string{
    "": `<doc topic="root">...</doc>`,
    "alerts": `<doc topic="alerts">...</doc>`,
    "alerts/filters": `<doc topic="alerts/filters">...</doc>`,
    // ... all topics from spec
}

func runDoc(args []string) {
    topic := ""
    if len(args) > 0 {
        topic = strings.Join(args, "/")
    }
    content, ok := docTopics[topic]
    if !ok {
        printError("Unknown topic: "+topic, "Run 'dashboard-cli doc' to see all topics")
    }
    fmt.Println(content)
}
```

Topics to include: root, alerts, alerts/filters, alert-rules, audit, audit/filters, machines, metrics, sites, workers, auth, admin, configure, output

- [ ] **Step 2: Verify compilation**

Run: `go build ./cmd/dashboard-cli`

- [ ] **Step 3: Commit**

```bash
git add cmd/dashboard-cli/cmd_doc.go
git commit -m "feat: add dashboard-cli doc command with progressive disclosure"
```

---

## Phase 3: CLI Data Commands

### Task 12: Sites command

**Files:**
- Create: `cmd/dashboard-cli/cmd_sites.go`

- [ ] **Step 1: Create cmd_sites.go**

Calls `GET /api/sites` (may need to figure out proper auth path — the sites endpoint requires `site_id` query param for RBAC, but API key users bypass RBAC). For each site, calls `GET /api/sites/{id}/summary`.

Output XML `<sites>` with `<site>` elements, each with id, name, code, timezone, total_machines, online_machines, active_alerts, total_lines attributes.

Respects `--head` flag and token budget.

- [ ] **Step 2: Verify with `go build` and manual test**

- [ ] **Step 3: Commit**

```bash
git add cmd/dashboard-cli/cmd_sites.go
git commit -m "feat: add dashboard-cli sites command"
```

---

### Task 13: Alerts command

**Files:**
- Create: `cmd/dashboard-cli/cmd_alerts.go`

- [ ] **Step 1: Create cmd_alerts.go**

Flags: `--site`, `--severity`, `--status`, `--last`, `--page`, `--head`

`--site` resolves code → ID by querying sites first.
`--last` converts to `since` RFC3339 timestamp.

Calls `GET /api/alert-events?site_id=X&severity=X&status=X&since=X&limit=N&offset=N`

Response is `{events: [...], total: N}`. Format each event as `<alert>` element with attributes: id, severity, status, alert_name, line, machine, metric, reading, condition, threshold, triggered_at.

Estimated ~80 tokens per record → pageSize ~10-12.

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_alerts.go
git commit -m "feat: add dashboard-cli alerts command"
```

---

### Task 14: Alert-rules command

**Files:**
- Create: `cmd/dashboard-cli/cmd_alert_rules.go`

- [ ] **Step 1: Create cmd_alert_rules.go**

Flags: `--site`, `--head`

Calls `GET /api/alerts?site_id=X`

Format as `<alert_rules>` with `<rule>` elements.

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_alert_rules.go
git commit -m "feat: add dashboard-cli alert-rules command"
```

---

### Task 15: Audit command

**Files:**
- Create: `cmd/dashboard-cli/cmd_audit.go`

- [ ] **Step 1: Create cmd_audit.go**

Flags: `--user`, `--action`, `--resource`, `--last`, `--page`, `--head`

`--user` resolves name/email → user_id by querying `GET /api/users`.
`--last` converts to `since` RFC3339.

Calls `GET /api/audit-logs?user_id=X&action=X&resource_type=X&since=X&limit=N&offset=N`

Response is `{logs: [...], total: N}` (after Task 6 changes).

Format as `<audit_logs>` with `<log>` elements including details as nested `<details>` XML.

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_audit.go
git commit -m "feat: add dashboard-cli audit command"
```

---

### Task 16: Machines command

**Files:**
- Create: `cmd/dashboard-cli/cmd_machines.go`

- [ ] **Step 1: Create cmd_machines.go**

Flags: `--site`, `--head`

Calls `GET /api/sites/X/lines` and `GET /api/site-machines?site_id=X`.

Groups machines by line in output:
```xml
<machines site="Factory A">
  <line id="x" name="Assembly Line 1">
    <machine id="y" name="CNC-01" model="Fanuc" status="running"/>
  </line>
</machines>
```

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_machines.go
git commit -m "feat: add dashboard-cli machines command"
```

---

### Task 17: Metrics command

**Files:**
- Create: `cmd/dashboard-cli/cmd_metrics.go`

- [ ] **Step 1: Create cmd_metrics.go**

Flags: `--machine`, `--metric`, `--last`, `--head`

Without `--metric`: calls `GET /api/machines/X/latest` → shows latest values for all metrics.
With `--metric`: calls `GET /api/datapoints?machine_id=X&metric=Y&range=Z` → time-series.

Time-series data is dense — pageSize ~10 points.

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_metrics.go
git commit -m "feat: add dashboard-cli metrics command"
```

---

### Task 18: Workers command

**Files:**
- Create: `cmd/dashboard-cli/cmd_workers.go`

- [ ] **Step 1: Create cmd_workers.go**

Flags: `--head`

Calls `GET /api/workers`

Format as `<workers>` with `<worker>` elements.

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_workers.go
git commit -m "feat: add dashboard-cli workers command"
```

---

### Task 19: Admin command — key management

**Files:**
- Create: `cmd/dashboard-cli/cmd_admin.go`

- [ ] **Step 1: Create cmd_admin.go**

Subcommands: `create-key`, `list-keys`, `revoke-key`

```bash
dashboard-cli admin create-key --name "claude-agent"
dashboard-cli admin list-keys
dashboard-cli admin revoke-key --id <uuid>
```

`create-key` calls `POST /api/llm/keys` with `{"name": "..."}`.
`list-keys` calls `GET /api/llm/keys`.
`revoke-key` calls `DELETE /api/llm/keys/{id}`.

Output the created key in a clear format so the user can copy it.

- [ ] **Step 2: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_admin.go
git commit -m "feat: add dashboard-cli admin key management commands"
```

---

### Task 20: Inject-skill command

**Files:**
- Create: `cmd/dashboard-cli/cmd_inject_skill.go`
- Create: `cmd/dashboard-cli/skills/claude-code.md`

- [ ] **Step 1: Create the skill template**

Create `cmd/dashboard-cli/skills/claude-code.md` with the skill content from the spec. This will be embedded in the binary using `//go:embed`.

- [ ] **Step 2: Create cmd_inject_skill.go**

Flags: `--global`, `--target DIR`

```bash
dashboard-cli inject-skill claude-code              # → .claude/skills/dashboard-cli.md
dashboard-cli inject-skill claude-code --global      # → ~/.claude/skills/dashboard-cli.md
dashboard-cli inject-skill claude-code --target DIR  # → DIR/.claude/skills/dashboard-cli.md
```

Uses `//go:embed skills/claude-code.md` to embed the template.

Determines target directory:
- `--target DIR`: use DIR
- `--global`: use `~/.claude/skills/`
- default: use `./.claude/skills/`

Creates directory if needed, writes the file.

- [ ] **Step 3: Verify and commit**

```bash
git add cmd/dashboard-cli/cmd_inject_skill.go cmd/dashboard-cli/skills/
git commit -m "feat: add dashboard-cli inject-skill command for Claude Code"
```

---

## Phase 4: Integration Test

### Task 21: End-to-end test

- [ ] **Step 1: Build the CLI**

Run: `make dashboard-cli`

- [ ] **Step 2: Start server with bootstrap key**

Run: `DASHBOARD_BOOTSTRAP_KEY=true make dev`
Copy the printed API key from server stdout.

- [ ] **Step 3: Configure CLI**

Run: `./bin/dashboard-cli configure --url http://localhost:8080 --api-key dk_...`

- [ ] **Step 4: Test all commands**

```bash
./bin/dashboard-cli doc
./bin/dashboard-cli doc alerts
./bin/dashboard-cli sites
./bin/dashboard-cli sites --head 0
./bin/dashboard-cli alerts --site <code> --last 7d
./bin/dashboard-cli alerts --site <code> --head 0
./bin/dashboard-cli alert-rules --site <code>
./bin/dashboard-cli audit --last 3d
./bin/dashboard-cli machines --site <code>
./bin/dashboard-cli metrics --machine <id>
./bin/dashboard-cli workers
./bin/dashboard-cli admin list-keys
./bin/dashboard-cli inject-skill claude-code
```

Verify each outputs valid XML with `<meta>` header.

- [ ] **Step 5: Test token budget**

Verify no command outputs more than ~3KB of text.

- [ ] **Step 6: Test --head 0**

Verify all commands with `--head 0` output only `<meta>` block.
