# Alert Config UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD management UI for alert rules with adaptive analog/coil forms, multi-select bulk actions, and batch info acknowledgement.

**Architecture:** New Alert Rules page with dialog-based create/edit, backed by new Go endpoints (Update, Delete, Bulk Action, Ack Info, Register Metrics). Frontend uses existing TanStack Query patterns with new mutation hooks. Coil alerts reuse existing schema with `condition == "==" and threshold 0/1`.

**Tech Stack:** React 18, TypeScript, shadcn/ui, TanStack Query, Go chi router, pgx, TimescaleDB, react-i18next

**Spec:** `docs/superpowers/specs/2026-03-26-alert-config-ui-design.md`

---

## File Structure

### Backend (new/modified)
| File | Action | Responsibility |
|------|--------|---------------|
| `internal/alert/store.go` | Modify | Add UpdateAlert, DeleteAlert, BulkUpdateAlerts, BulkDeleteAlerts, AcknowledgeInfoEvents; add UpdatedAt to Alert struct |
| `internal/alert/handler.go` | Modify | Add UpdateAlert, DeleteAlert, BulkAlertAction, AcknowledgeInfoEvents handlers |
| `internal/alert/store_test.go` | Create | Tests for new store methods |
| `internal/alert/handler_test.go` | Create | Tests for new handlers |
| `internal/site/store.go` | Modify | Add ListMachineRegisterMetrics and ListMachinesBySite methods |
| `internal/site/handler.go` | Modify | Add GetRegisterMetrics and ListSiteMachines handlers |
| `cmd/server/main.go` | Modify | Register new routes |

### Frontend (new/modified)
| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/lib/hooks.ts` | Modify | Add hooks: useSiteMachines, useCreateAlert, useUpdateAlert, useDeleteAlert, useBulkAlertAction, useMachineMetrics, useAcknowledgeAllInfo |
| `frontend/src/pages/AlertRulesPage.tsx` | Create | Alert rules table with multi-select, filters, bulk actions |
| `frontend/src/components/alerts/AlertRuleDialog.tsx` | Create | Create/edit dialog with adaptive analog/coil form |
| `frontend/src/pages/AlertsPage.tsx` | Modify | Add "Acknowledge All Info" button |
| `frontend/src/App.tsx` | Modify | Add `/alerts/rules` route |
| `frontend/src/locales/en.json` | Modify | Add alertRules.* keys |
| `frontend/src/locales/zh-TW.json` | Modify | Add alertRules.* keys |
| `frontend/src/locales/th.json` | Modify | Add alertRules.* keys |
| `frontend/src/locales/vi.json` | Modify | Add alertRules.* keys |

---

## Task 1: Backend — Add UpdatedAt to Alert struct and update existing queries

**Files:**
- Modify: `internal/alert/store.go:19-29` (Alert struct), `internal/alert/store.go:42-63` (ListAlerts), `internal/alert/store.go:100-109` (CreateAlert)

- [ ] **Step 1: Add UpdatedAt field to Alert struct**

In `internal/alert/store.go`, add `UpdatedAt` to the struct:

```go
type Alert struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	MachineID  string    `json:"machine_id"`
	MetricName string    `json:"metric_name"`
	Condition  string    `json:"condition"`
	Threshold  float64   `json:"threshold"`
	Severity   string    `json:"severity"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}
```

- [ ] **Step 2: Update ListAlerts query to include updated_at**

Update the SQL SELECT and Scan in `ListAlerts` to include `a.updated_at` and scan into `alert.UpdatedAt`.

- [ ] **Step 3: Update CreateAlert query to include updated_at in RETURNING**

Update the RETURNING clause to include `updated_at` and scan into `alert.UpdatedAt`.

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/macmini-au/code/industry-dashboard && go build ./...`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add internal/alert/store.go
git commit -m "feat(alert): add UpdatedAt field to Alert struct"
```

---

## Task 2: Backend — UpdateAlert store method

**Files:**
- Modify: `internal/alert/store.go`

- [ ] **Step 1: Add UpdateAlert method to store**

```go
func (s *Store) UpdateAlert(ctx context.Context, id string, name, metricName, condition string, threshold float64, severity string, isActive bool) (*Alert, error) {
	var alert Alert
	err := s.db.QueryRow(ctx,
		`UPDATE alerts
		 SET name = $2, metric_name = $3, condition = $4, threshold = $5, severity = $6, is_active = $7, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, name, machine_id, metric_name, condition, threshold, severity, is_active, created_at, updated_at`,
		id, name, metricName, condition, threshold, severity, isActive,
	).Scan(&alert.ID, &alert.Name, &alert.MachineID, &alert.MetricName, &alert.Condition, &alert.Threshold, &alert.Severity, &alert.IsActive, &alert.CreatedAt, &alert.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &alert, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add internal/alert/store.go
git commit -m "feat(alert): add UpdateAlert store method"
```

---

## Task 3: Backend — DeleteAlert store method

**Files:**
- Modify: `internal/alert/store.go`

- [ ] **Step 1: Add DeleteAlert method**

```go
func (s *Store) DeleteAlert(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM alerts WHERE id = $1`, id)
	return err
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add internal/alert/store.go
git commit -m "feat(alert): add DeleteAlert store method"
```

---

## Task 4: Backend — BulkUpdateAlerts and BulkDeleteAlerts store methods

**Files:**
- Modify: `internal/alert/store.go`

- [ ] **Step 1: Add BulkUpdateAlerts method**

```go
func (s *Store) BulkUpdateAlerts(ctx context.Context, ids []string, isActive bool) (int64, error) {
	ct, err := s.db.Exec(ctx,
		`UPDATE alerts SET is_active = $2, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
		ids, isActive,
	)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}
```

- [ ] **Step 2: Add BulkDeleteAlerts method**

```go
func (s *Store) BulkDeleteAlerts(ctx context.Context, ids []string) (int64, error) {
	ct, err := s.db.Exec(ctx,
		`DELETE FROM alerts WHERE id = ANY($1::uuid[])`,
		ids,
	)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add internal/alert/store.go
git commit -m "feat(alert): add bulk update/delete store methods"
```

---

## Task 5: Backend — AcknowledgeInfoEvents store method

**Files:**
- Modify: `internal/alert/store.go`

- [ ] **Step 1: Add AcknowledgeInfoEvents method**

This requires joining through alerts → machines → production_lines to scope by site, and filtering by severity = 'info'.

```go
func (s *Store) AcknowledgeInfoEvents(ctx context.Context, siteID, userID string) (int64, error) {
	ct, err := s.db.Exec(ctx,
		`UPDATE alert_events ae
		 SET acknowledged_by = $2
		 FROM alerts a
		 JOIN machines m ON m.id = a.machine_id
		 JOIN production_lines pl ON pl.id = m.line_id
		 WHERE ae.alert_id = a.id
		   AND pl.site_id = $1
		   AND a.severity = 'info'
		   AND ae.resolved_at IS NULL
		   AND ae.acknowledged_by IS NULL`,
		siteID, userID,
	)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add internal/alert/store.go
git commit -m "feat(alert): add AcknowledgeInfoEvents store method"
```

---

## Task 6: Backend — ListMachinesBySite and ListMachineRegisterMetrics in site store

**Files:**
- Modify: `internal/site/store.go`

- [ ] **Step 1: Add ListMachinesBySite method**

The existing `ListMachinesByLine` only takes a `lineID`. We need a site-level query for the machine dropdown in the alert dialog.

```go
func (s *Store) ListMachinesBySite(ctx context.Context, siteID string) ([]Machine, error) {
	rows, err := s.db.Query(ctx,
		`SELECT m.id, m.line_id, m.name, m.model, m.status, m.modbus_config, m.created_at
		 FROM machines m
		 JOIN production_lines pl ON m.line_id = pl.id
		 WHERE pl.site_id = $1
		 ORDER BY m.name`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var machines []Machine
	for rows.Next() {
		var m Machine
		if err := rows.Scan(&m.ID, &m.LineID, &m.Name, &m.Model, &m.Status, &m.Config, &m.CreatedAt); err != nil {
			return nil, err
		}
		machines = append(machines, m)
	}
	return machines, rows.Err()
}
```

- [ ] **Step 2: Add RegisterMetric struct and ListMachineRegisterMetrics method**

```go
type RegisterMetric struct {
	Name         string `json:"name"`
	Type         string `json:"type"`          // "analog" or "coil"
	RegisterType string `json:"register_type"` // "holding", "input", "coil", "discrete_input"
}

func (s *Store) ListMachineRegisterMetrics(ctx context.Context, machineID string) ([]RegisterMetric, error) {
	registers, err := s.GetMachineRegisters(ctx, machineID)
	if err != nil || len(registers) == 0 {
		// Fallback: query distinct metric names from data_points, default to analog
		return s.listMetricsFromDataPoints(ctx, machineID)
	}

	metrics := make([]RegisterMetric, 0, len(registers))
	for _, reg := range registers {
		metricType := "analog"
		if reg.Type == "coil" || reg.Type == "discrete_input" {
			metricType = "coil"
		}
		metrics = append(metrics, RegisterMetric{
			Name:         reg.Name,
			Type:         metricType,
			RegisterType: reg.Type,
		})
	}
	return metrics, nil
}

func (s *Store) listMetricsFromDataPoints(ctx context.Context, machineID string) ([]RegisterMetric, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT metric_name FROM data_points WHERE machine_id = $1 ORDER BY metric_name`,
		machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var metrics []RegisterMetric
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		metrics = append(metrics, RegisterMetric{Name: name, Type: "analog", RegisterType: "unknown"})
	}
	return metrics, rows.Err()
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add internal/site/store.go
git commit -m "feat(site): add ListMachinesBySite and ListMachineRegisterMetrics methods"
```

---

## Task 7: Backend — New alert handlers (Update, Delete, Bulk, AckInfo)

**Files:**
- Modify: `internal/alert/handler.go`

- [ ] **Step 1: Add UpdateAlert handler**

```go
func (h *Handler) UpdateAlert(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "alertID")
	var body struct {
		Name       string  `json:"name"`
		MetricName string  `json:"metric_name"`
		Condition  string  `json:"condition"`
		Threshold  float64 `json:"threshold"`
		Severity   string  `json:"severity"`
		IsActive   bool    `json:"is_active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if body.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	alert, err := h.store.UpdateAlert(r.Context(), id, body.Name, body.MetricName, body.Condition, body.Threshold, body.Severity, body.IsActive)
	if err != nil {
		http.Error(w, "failed to update alert", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alert)
}
```

- [ ] **Step 2: Add DeleteAlert handler**

```go
func (h *Handler) DeleteAlert(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "alertID")
	if err := h.store.DeleteAlert(r.Context(), id); err != nil {
		http.Error(w, "failed to delete alert", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 3: Add BulkAlertAction handler**

```go
func (h *Handler) BulkAlertAction(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs    []string `json:"ids"`
		Action string   `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if len(body.IDs) == 0 {
		http.Error(w, "ids is required", http.StatusBadRequest)
		return
	}

	var count int64
	var err error
	switch body.Action {
	case "enable":
		count, err = h.store.BulkUpdateAlerts(r.Context(), body.IDs, true)
	case "disable":
		count, err = h.store.BulkUpdateAlerts(r.Context(), body.IDs, false)
	case "delete":
		count, err = h.store.BulkDeleteAlerts(r.Context(), body.IDs)
	default:
		http.Error(w, "invalid action: must be enable, disable, or delete", http.StatusBadRequest)
		return
	}
	if err != nil {
		http.Error(w, "bulk action failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"affected": count})
}
```

- [ ] **Step 4: Add AcknowledgeInfoEvents handler**

```go
func (h *Handler) AcknowledgeInfoEvents(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id is required", http.StatusBadRequest)
		return
	}
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	count, err := h.store.AcknowledgeInfoEvents(r.Context(), siteID, claims.UserID)
	if err != nil {
		http.Error(w, "failed to acknowledge info events", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"acknowledged": count})
}
```

- [ ] **Step 5: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add internal/alert/handler.go
git commit -m "feat(alert): add Update, Delete, Bulk, AckInfo handlers"
```

---

## Task 8: Backend — Site machines and register metrics handlers

**Files:**
- Modify: `internal/site/handler.go`

- [ ] **Step 1: Add ListSiteMachines handler**

```go
func (h *Handler) ListSiteMachines(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id is required", http.StatusBadRequest)
		return
	}
	machines, err := h.store.ListMachinesBySite(r.Context(), siteID)
	if err != nil {
		http.Error(w, "failed to list machines", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(machines)
}
```

- [ ] **Step 2: Add GetRegisterMetrics handler**

```go
func (h *Handler) GetRegisterMetrics(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	metrics, err := h.store.ListMachineRegisterMetrics(r.Context(), machineID)
	if err != nil {
		metrics = []RegisterMetric{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add internal/site/handler.go
git commit -m "feat(site): add ListSiteMachines and GetRegisterMetrics handlers"
```

---

## Task 9: Backend — Register new routes

**Files:**
- Modify: `cmd/server/main.go:393-401` (alert routes), `cmd/server/main.go:408-416` (machine routes)

- [ ] **Step 1: Add new alert routes**

In the `/alerts` route group, add bulk-action BEFORE `/{alertID}` routes:

```go
r.Route("/alerts", func(r chi.Router) {
	r.With(rbacMW.Require("alert:view", rbac.SiteFromQuery)).Get("/", alertHandler.ListAlerts)
	r.With(rbacMW.Require("alert:create", rbac.SiteFromQuery), auditMW.Log("alert", "create")).Post("/", alertHandler.CreateAlert)
	r.With(rbacMW.Require("alert:manage", rbac.SiteFromQuery), auditMW.Log("alert", "bulk_action")).Post("/bulk-action", alertHandler.BulkAlertAction)
	r.Route("/{alertID}", func(r chi.Router) {
		r.With(rbacMW.Require("alert:manage", rbac.SiteFromQuery), auditMW.Log("alert", "update")).Put("/", alertHandler.UpdateAlert)
		r.With(rbacMW.Require("alert:manage", rbac.SiteFromQuery), auditMW.Log("alert", "delete")).Delete("/", alertHandler.DeleteAlert)
	})
})
```

- [ ] **Step 2: Add acknowledge-info route**

In the `/alert-events` route group, add:

```go
r.With(rbacMW.Require("alert:acknowledge", rbac.SiteFromQuery), auditMW.Log("alert_event", "acknowledge_info")).Post("/acknowledge-info", alertHandler.AcknowledgeInfoEvents)
```

- [ ] **Step 3: Add register-metrics route and site-machines route**

In the `/machines/{machineID}` route group, add:

```go
r.With(rbacMW.Require("alert:view", rbac.SiteFromQuery)).Get("/register-metrics", siteHandler.GetRegisterMetrics)
```

Add a site-level machines endpoint (near existing site routes):

```go
r.With(rbacMW.Require("machine:view", rbac.SiteFromQuery)).Get("/site-machines", siteHandler.ListSiteMachines)
```

- [ ] **Step 4: Verify compilation**

Run: `go build ./...`
Expected: Clean build

- [ ] **Step 5: Commit**

```bash
git add cmd/server/main.go
git commit -m "feat: register alert CRUD and register-metrics routes"
```

---

## Task 10: Frontend — Add new hooks

**Files:**
- Modify: `frontend/src/lib/hooks.ts`

- [ ] **Step 1: Add useSiteMachines query hook and mutation hooks for alert CRUD**

Add after the existing `useAcknowledgeAlert` hook:

```typescript
export function useSiteMachines(siteId: string | undefined) {
  return useQuery({
    queryKey: ['site-machines', siteId],
    queryFn: () => fetchJSON<any[]>(`/site-machines?site_id=${siteId}`),
    enabled: !!siteId,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, ...data }: {
      siteId: string;
      name: string;
      machine_id: string;
      metric_name: string;
      condition: string;
      threshold: number;
      severity: string;
    }) =>
      mutateJSON(`/alerts?site_id=${siteId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useUpdateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, siteId, ...data }: {
      id: string;
      siteId: string;
      name: string;
      metric_name: string;
      condition: string;
      threshold: number;
      severity: string;
      is_active: boolean;
    }) =>
      mutateJSON(`/alerts/${id}?site_id=${siteId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useDeleteAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, siteId }: { id: string; siteId: string }) =>
      mutateJSON(`/alerts/${id}?site_id=${siteId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useBulkAlertAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, ...data }: {
      siteId: string;
      ids: string[];
      action: 'enable' | 'disable' | 'delete';
    }) =>
      mutateJSON(`/alerts/bulk-action?site_id=${siteId}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

export function useMachineMetrics(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-register-metrics', machineId],
    queryFn: () =>
      fetchJSON<{ name: string; type: string; register_type: string }[]>(
        `/machines/${machineId}/register-metrics`
      ),
    enabled: !!machineId,
  });
}

export function useAcknowledgeAllInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (siteId: string) =>
      mutateJSON(`/alert-events/acknowledge-info?site_id=${siteId}`, {
        method: 'POST',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/hooks.ts
git commit -m "feat: add alert CRUD, bulk action, and register-metrics hooks"
```

---

## Task 11: Frontend — i18n keys for all 4 locales

**Files:**
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/zh-TW.json`
- Modify: `frontend/src/locales/th.json`
- Modify: `frontend/src/locales/vi.json`

- [ ] **Step 1: Add alertRules keys to en.json**

Add after the existing `"alerts"` section:

```json
"alertRules": {
  "title": "Alert Rules",
  "subtitle": "Manage alert rules for your site",
  "createButton": "Create Alert Rule",
  "editTitle": "Edit Alert Rule",
  "createTitle": "Create Alert Rule",
  "name": "Rule Name",
  "machine": "Machine",
  "metric": "Metric",
  "condition": "Condition",
  "threshold": "Threshold",
  "severity": "Severity",
  "active": "Active",
  "actions": "Actions",
  "on": "On",
  "off": "Off",
  "preview": "Alert when {{metric}} on {{machine}} is {{condition}} → {{severity}}",
  "previewLabel": "Preview",
  "alertWhenOn": "= ON",
  "alertWhenOff": "= OFF",
  "coilHint": "No threshold needed — coils are binary (ON/OFF)",
  "registerType": "Register type: {{type}}",
  "bulkSelected": "{{count}} rules selected",
  "bulkEnable": "Enable",
  "bulkDisable": "Disable",
  "bulkDelete": "Delete",
  "clearSelection": "Clear selection",
  "confirmDelete": "Are you sure you want to delete this alert rule?",
  "confirmBulkDelete": "Are you sure you want to delete {{count}} alert rule(s)?",
  "allMachines": "All Machines",
  "allSeverities": "All Severities",
  "allStatus": "All Status",
  "noRules": "No alert rules configured.",
  "selectSite": "Select a site.",
  "conditions": {
    "gt": "> greater than",
    "lt": "< less than",
    "gte": ">= greater or equal",
    "lte": "<= less or equal",
    "eq": "== equal to"
  },
  "saveChanges": "Save Changes"
},
"alertEvents": {
  "ackAllInfo": "Acknowledge All Info",
  "ackAllInfoConfirm": "Acknowledge {{count}} info event(s)?"
}
```

- [ ] **Step 2: Add alertRules keys to zh-TW.json**

```json
"alertRules": {
  "title": "警報規則",
  "subtitle": "管理站點的警報規則",
  "createButton": "新增警報規則",
  "editTitle": "編輯警報規則",
  "createTitle": "新增警報規則",
  "name": "規則名稱",
  "machine": "機台",
  "metric": "指標",
  "condition": "條件",
  "threshold": "門檻值",
  "severity": "嚴重性",
  "active": "啟用",
  "actions": "操作",
  "on": "開啟",
  "off": "關閉",
  "preview": "當 {{machine}} 的 {{metric}} {{condition}} 時觸發 → {{severity}}",
  "previewLabel": "預覽",
  "alertWhenOn": "= 開啟",
  "alertWhenOff": "= 關閉",
  "coilHint": "線圈為二進位（開/關），不需要門檻值",
  "registerType": "暫存器類型：{{type}}",
  "bulkSelected": "已選擇 {{count}} 條規則",
  "bulkEnable": "啟用",
  "bulkDisable": "停用",
  "bulkDelete": "刪除",
  "clearSelection": "清除選擇",
  "confirmDelete": "確定要刪除此警報規則嗎？",
  "confirmBulkDelete": "確定要刪除 {{count}} 條警報規則嗎？",
  "allMachines": "所有機台",
  "allSeverities": "所有嚴重性",
  "allStatus": "所有狀態",
  "noRules": "尚未設定警報規則。",
  "selectSite": "請選擇站點。",
  "conditions": {
    "gt": "> 大於",
    "lt": "< 小於",
    "gte": ">= 大於等於",
    "lte": "<= 小於等於",
    "eq": "== 等於"
  },
  "saveChanges": "儲存變更"
},
"alertEvents": {
  "ackAllInfo": "確認所有資訊事件",
  "ackAllInfoConfirm": "確認 {{count}} 個資訊事件？"
}
```

- [ ] **Step 3: Add alertRules keys to th.json**

```json
"alertRules": {
  "title": "กฎการแจ้งเตือน",
  "subtitle": "จัดการกฎการแจ้งเตือนสำหรับไซต์ของคุณ",
  "createButton": "สร้างกฎการแจ้งเตือน",
  "editTitle": "แก้ไขกฎการแจ้งเตือน",
  "createTitle": "สร้างกฎการแจ้งเตือน",
  "name": "ชื่อกฎ",
  "machine": "เครื่องจักร",
  "metric": "ตัวชี้วัด",
  "condition": "เงื่อนไข",
  "threshold": "เกณฑ์",
  "severity": "ความรุนแรง",
  "active": "ใช้งาน",
  "actions": "การดำเนินการ",
  "on": "เปิด",
  "off": "ปิด",
  "preview": "แจ้งเตือนเมื่อ {{metric}} บน {{machine}} คือ {{condition}} → {{severity}}",
  "previewLabel": "ตัวอย่าง",
  "alertWhenOn": "= เปิด",
  "alertWhenOff": "= ปิด",
  "coilHint": "คอยล์เป็นไบนารี (เปิด/ปิด) ไม่ต้องกำหนดเกณฑ์",
  "registerType": "ประเภทรีจิสเตอร์: {{type}}",
  "bulkSelected": "เลือกแล้ว {{count}} กฎ",
  "bulkEnable": "เปิดใช้งาน",
  "bulkDisable": "ปิดใช้งาน",
  "bulkDelete": "ลบ",
  "clearSelection": "ล้างการเลือก",
  "confirmDelete": "คุณแน่ใจหรือไม่ว่าต้องการลบกฎการแจ้งเตือนนี้?",
  "confirmBulkDelete": "คุณแน่ใจหรือไม่ว่าต้องการลบกฎการแจ้งเตือน {{count}} รายการ?",
  "allMachines": "เครื่องจักรทั้งหมด",
  "allSeverities": "ความรุนแรงทั้งหมด",
  "allStatus": "สถานะทั้งหมด",
  "noRules": "ยังไม่มีกฎการแจ้งเตือน",
  "selectSite": "เลือกไซต์",
  "conditions": {
    "gt": "> มากกว่า",
    "lt": "< น้อยกว่า",
    "gte": ">= มากกว่าหรือเท่ากับ",
    "lte": "<= น้อยกว่าหรือเท่ากับ",
    "eq": "== เท่ากับ"
  },
  "saveChanges": "บันทึกการเปลี่ยนแปลง"
},
"alertEvents": {
  "ackAllInfo": "รับทราบข้อมูลทั้งหมด",
  "ackAllInfoConfirm": "รับทราบเหตุการณ์ข้อมูล {{count}} รายการ?"
}
```

- [ ] **Step 4: Add alertRules keys to vi.json**

```json
"alertRules": {
  "title": "Quy tắc cảnh báo",
  "subtitle": "Quản lý quy tắc cảnh báo cho site của bạn",
  "createButton": "Tạo quy tắc cảnh báo",
  "editTitle": "Chỉnh sửa quy tắc cảnh báo",
  "createTitle": "Tạo quy tắc cảnh báo",
  "name": "Tên quy tắc",
  "machine": "Máy",
  "metric": "Chỉ số",
  "condition": "Điều kiện",
  "threshold": "Ngưỡng",
  "severity": "Mức độ",
  "active": "Hoạt động",
  "actions": "Hành động",
  "on": "Bật",
  "off": "Tắt",
  "preview": "Cảnh báo khi {{metric}} trên {{machine}} là {{condition}} → {{severity}}",
  "previewLabel": "Xem trước",
  "alertWhenOn": "= BẬT",
  "alertWhenOff": "= TẮT",
  "coilHint": "Cuộn dây là nhị phân (Bật/Tắt) — không cần ngưỡng",
  "registerType": "Loại thanh ghi: {{type}}",
  "bulkSelected": "Đã chọn {{count}} quy tắc",
  "bulkEnable": "Bật",
  "bulkDisable": "Tắt",
  "bulkDelete": "Xóa",
  "clearSelection": "Xóa lựa chọn",
  "confirmDelete": "Bạn có chắc chắn muốn xóa quy tắc cảnh báo này?",
  "confirmBulkDelete": "Bạn có chắc chắn muốn xóa {{count}} quy tắc cảnh báo?",
  "allMachines": "Tất cả máy",
  "allSeverities": "Tất cả mức độ",
  "allStatus": "Tất cả trạng thái",
  "noRules": "Chưa có quy tắc cảnh báo.",
  "selectSite": "Chọn site.",
  "conditions": {
    "gt": "> lớn hơn",
    "lt": "< nhỏ hơn",
    "gte": ">= lớn hơn hoặc bằng",
    "lte": "<= nhỏ hơn hoặc bằng",
    "eq": "== bằng"
  },
  "saveChanges": "Lưu thay đổi"
},
"alertEvents": {
  "ackAllInfo": "Xác nhận tất cả thông tin",
  "ackAllInfoConfirm": "Xác nhận {{count}} sự kiện thông tin?"
}
```

- [ ] **Step 5: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 6: Commit**

```bash
git add frontend/src/locales/
git commit -m "feat(i18n): add alert rules and ack-all-info translation keys"
```

---

## Task 12: Frontend — Install missing shadcn/ui components

**Files:**
- Create: `frontend/src/components/ui/alert-dialog.tsx` (generated by shadcn CLI)
- Create: `frontend/src/components/ui/checkbox.tsx` (if not exists, generated by shadcn CLI)

- [ ] **Step 1: Install alert-dialog and checkbox components**

```bash
cd frontend && npx shadcn@latest add alert-dialog checkbox
```

- [ ] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/
git commit -m "feat: add alert-dialog and checkbox shadcn/ui components"
```

---

## Task 13: Frontend — AlertRuleDialog component

**Files:**
- Create: `frontend/src/components/alerts/AlertRuleDialog.tsx`

- [ ] **Step 1: Create the adaptive create/edit dialog**

```typescript
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSiteMachines, useMachineMetrics, useCreateAlert, useUpdateAlert } from '@/lib/hooks';

interface AlertRule {
  id: string;
  name: string;
  machine_id: string;
  metric_name: string;
  condition: string;
  threshold: number;
  severity: string;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  editRule?: AlertRule | null;
}

const CONDITIONS = ['>', '<', '>=', '<=', '=='] as const;

export default function AlertRuleDialog({ open, onClose, siteId, editRule }: Props) {
  const { t } = useTranslation();
  const createAlert = useCreateAlert();
  const updateAlert = useUpdateAlert();
  const { data: machines } = useSiteMachines(siteId);

  const [name, setName] = useState('');
  const [machineId, setMachineId] = useState('');
  const [metricName, setMetricName] = useState('');
  const [condition, setCondition] = useState('>');
  const [threshold, setThreshold] = useState(0);
  const [severity, setSeverity] = useState('warning');
  const [coilValue, setCoilValue] = useState<0 | 1>(1);
  const [error, setError] = useState('');

  const { data: metrics } = useMachineMetrics(machineId || undefined);
  const selectedMetric = metrics?.find((m) => m.name === metricName);
  const isCoil = selectedMetric?.type === 'coil';
  const isEdit = !!editRule;

  useEffect(() => {
    if (open) {
      if (editRule) {
        setName(editRule.name);
        setMachineId(editRule.machine_id);
        setMetricName(editRule.metric_name);
        setCondition(editRule.condition);
        setThreshold(editRule.threshold);
        setSeverity(editRule.severity);
        setCoilValue(editRule.threshold === 1 ? 1 : 0);
      } else {
        setName('');
        setMachineId('');
        setMetricName('');
        setCondition('>');
        setThreshold(0);
        setSeverity('warning');
        setCoilValue(1);
      }
      setError('');
    }
  }, [open, editRule]);

  // Reset metric when machine changes (only in create mode)
  useEffect(() => {
    if (!isEdit) {
      setMetricName('');
    }
  }, [machineId, isEdit]);

  const handleSubmit = async () => {
    setError('');
    const finalCondition = isCoil ? '==' : condition;
    const finalThreshold = isCoil ? coilValue : threshold;

    try {
      if (isEdit) {
        await updateAlert.mutateAsync({
          id: editRule!.id,
          siteId,
          name,
          metric_name: metricName,
          condition: finalCondition,
          threshold: finalThreshold,
          severity,
          is_active: editRule!.is_active,
        });
      } else {
        await createAlert.mutateAsync({
          siteId,
          name,
          machine_id: machineId,
          metric_name: metricName,
          condition: finalCondition,
          threshold: finalThreshold,
          severity,
        });
      }
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to save alert rule');
    }
  };

  const isPending = createAlert.isPending || updateAlert.isPending;
  const isValid = name && machineId && metricName && (!isCoil ? condition : true);

  const conditionLabel = isCoil
    ? coilValue === 1
      ? t('alertRules.alertWhenOn')
      : t('alertRules.alertWhenOff')
    : `${condition} ${threshold}`;

  const machineName = machines?.find((m: any) => m.id === machineId)?.name ?? machineId;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('alertRules.editTitle') : t('alertRules.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Label>{t('alertRules.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {/* Machine */}
          <div>
            <Label>{t('alertRules.machine')}</Label>
            <Select value={machineId} onValueChange={setMachineId} disabled={isEdit}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {machines?.map((m: any) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Metric */}
          {machineId && (
            <div>
              <Label>{t('alertRules.metric')}</Label>
              <Select value={metricName} onValueChange={setMetricName}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {metrics?.map((m) => (
                    <SelectItem key={m.name} value={m.name}>
                      {m.name} ({m.register_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedMetric && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('alertRules.registerType', { type: selectedMetric.type })}
                </p>
              )}
            </div>
          )}

          {/* Condition + Threshold (analog) */}
          {metricName && !isCoil && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>{t('alertRules.condition')}</Label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`alertRules.conditions.${c === '>' ? 'gt' : c === '<' ? 'lt' : c === '>=' ? 'gte' : c === '<=' ? 'lte' : 'eq'}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>{t('alertRules.threshold')}</Label>
                <Input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* Coil ON/OFF */}
          {metricName && isCoil && (
            <div>
              <Label>{t('alertRules.condition')}</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  variant={coilValue === 1 ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCoilValue(1)}
                  type="button"
                >
                  {t('alertRules.alertWhenOn')}
                </Button>
                <Button
                  variant={coilValue === 0 ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCoilValue(0)}
                  type="button"
                >
                  {t('alertRules.alertWhenOff')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('alertRules.coilHint')}</p>
            </div>
          )}

          {/* Severity */}
          {metricName && (
            <div>
              <Label>{t('alertRules.severity')}</Label>
              <div className="flex gap-2 mt-1">
                {(['info', 'warning', 'critical'] as const).map((s) => (
                  <Button
                    key={s}
                    variant={severity === s ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setSeverity(s)}
                    type="button"
                  >
                    {t(`alerts.${s}`)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {metricName && (
            <div className="bg-muted rounded-md p-3">
              <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">{t('alertRules.previewLabel')}</p>
              <p className="text-sm">
                {t('alertRules.preview', {
                  metric: metricName,
                  machine: machineName,
                  condition: conditionLabel,
                  severity: t(`alerts.${severity}`),
                })}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={handleSubmit} disabled={!isValid || isPending}>
              {isEdit ? t('alertRules.saveChanges') : t('alertRules.createButton')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build (or minor import path adjustments)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/alerts/AlertRuleDialog.tsx
git commit -m "feat: add AlertRuleDialog with adaptive analog/coil form"
```

---

## Task 14: Frontend — AlertRulesPage with multi-select

**Files:**
- Create: `frontend/src/pages/AlertRulesPage.tsx`

- [ ] **Step 1: Create AlertRulesPage component**

```typescript
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useSite } from '@/lib/site-context';
import { useAlerts, useDeleteAlert, useBulkAlertAction, useSiteMachines } from '@/lib/hooks';
import AlertRuleDialog from '@/components/alerts/AlertRuleDialog';

interface AlertRule {
  id: string;
  name: string;
  machine_id: string;
  metric_name: string;
  condition: string;
  threshold: number;
  severity: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function AlertRulesPage() {
  const { t } = useTranslation();
  const { currentSite } = useSite();
  const { data: machines } = useSiteMachines(currentSite?.id);
  const { data: rules, isLoading } = useAlerts(currentSite?.id);
  const deleteAlert = useDeleteAlert();
  const bulkAction = useBulkAlertAction();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterMachine, setFilterMachine] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<AlertRule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; bulk: boolean } | null>(null);

  const filtered = useMemo(() => {
    if (!rules) return [];
    return (rules as AlertRule[]).filter((r) => {
      if (filterMachine && r.machine_id !== filterMachine) return false;
      if (filterSeverity && r.severity !== filterSeverity) return false;
      if (filterActive === 'active' && !r.is_active) return false;
      if (filterActive === 'inactive' && r.is_active) return false;
      return true;
    });
  }, [rules, filterMachine, filterSeverity, filterActive]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleBulk = async (action: 'enable' | 'disable' | 'delete') => {
    if (action === 'delete') {
      setDeleteTarget({ ids: Array.from(selectedIds), bulk: true });
      return;
    }
    await bulkAction.mutateAsync({
      siteId: currentSite!.id,
      ids: Array.from(selectedIds),
      action,
    });
    setSelectedIds(new Set());
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.bulk) {
      await bulkAction.mutateAsync({
        siteId: currentSite!.id,
        ids: deleteTarget.ids,
        action: 'delete',
      });
      setSelectedIds(new Set());
    } else {
      await deleteAlert.mutateAsync({
        id: deleteTarget.ids[0],
        siteId: currentSite!.id,
      });
    }
    setDeleteTarget(null);
  };

  const handleEdit = (rule: AlertRule) => {
    setEditRule(rule);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditRule(null);
    setDialogOpen(true);
  };

  const getMachineName = (machineId: string) =>
    machines?.find((m: any) => m.id === machineId)?.name ?? machineId;

  const renderCondition = (rule: AlertRule) => {
    if (rule.condition === '==' && (rule.threshold === 0 || rule.threshold === 1)) {
      return `${rule.metric_name} = ${rule.threshold === 1 ? 'ON' : 'OFF'}`;
    }
    return `${rule.metric_name} ${rule.condition} ${rule.threshold}`;
  };

  const severityVariant = (s: string) => {
    if (s === 'critical') return 'destructive';
    if (s === 'warning') return 'warning' as any;
    return 'secondary';
  };

  if (!currentSite) return <p className="p-6">{t('alertRules.selectSite')}</p>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('alertRules.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('alertRules.subtitle')}</p>
        </div>
        <Button onClick={handleCreate}>{t('alertRules.createButton')}</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterMachine} onValueChange={setFilterMachine}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder={t('alertRules.allMachines')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alertRules.allMachines')}</SelectItem>
            {machines?.map((m: any) => (
              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeverity} onValueChange={setFilterSeverity}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t('alertRules.allSeverities')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alertRules.allSeverities')}</SelectItem>
            <SelectItem value="critical">{t('alerts.critical')}</SelectItem>
            <SelectItem value="warning">{t('alerts.warning')}</SelectItem>
            <SelectItem value="info">{t('alerts.info')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t('alertRules.allStatus')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('alertRules.allStatus')}</SelectItem>
            <SelectItem value="active">{t('alertRules.on')}</SelectItem>
            <SelectItem value="inactive">{t('alertRules.off')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {t('alertRules.bulkSelected', { count: selectedIds.size })}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => handleBulk('enable')}>{t('alertRules.bulkEnable')}</Button>
            <Button size="sm" variant="outline" onClick={() => handleBulk('disable')}>{t('alertRules.bulkDisable')}</Button>
            <Button size="sm" variant="destructive" onClick={() => handleBulk('delete')}>{t('alertRules.bulkDelete')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>{t('alertRules.clearSelection')}</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>{t('alertRules.name')}</TableHead>
                <TableHead>{t('alertRules.machine')}</TableHead>
                <TableHead>{t('alertRules.condition')}</TableHead>
                <TableHead>{t('alertRules.severity')}</TableHead>
                <TableHead>{t('alertRules.active')}</TableHead>
                <TableHead className="text-right">{t('alertRules.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{t('alertRules.noRules')}</TableCell></TableRow>
              ) : (
                filtered.map((rule) => (
                  <TableRow key={rule.id} className={selectedIds.has(rule.id) ? 'bg-blue-50 dark:bg-blue-950' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(rule.id)}
                        onCheckedChange={() => toggleSelect(rule.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{rule.name}</TableCell>
                    <TableCell>{getMachineName(rule.machine_id)}</TableCell>
                    <TableCell>
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                        {renderCondition(rule)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityVariant(rule.severity)}>
                        {t(`alerts.${rule.severity}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={rule.is_active ? 'text-green-500' : 'text-red-500'}>●</span>
                      {' '}{rule.is_active ? t('alertRules.on') : t('alertRules.off')}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(rule)}>✏️</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget({ ids: [rule.id], bulk: false })}
                      >
                        🗑️
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <AlertRuleDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditRule(null); }}
        siteId={currentSite.id}
        editRule={editRule}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('alertRules.bulkDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.bulk
                ? t('alertRules.confirmBulkDelete', { count: deleteTarget.ids.length })
                : t('alertRules.confirmDelete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('alertRules.bulkDelete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build (may need minor import adjustments for component paths)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AlertRulesPage.tsx
git commit -m "feat: add AlertRulesPage with multi-select and bulk actions"
```

---

## Task 15: Frontend — Add route and update AlertsPage

**Files:**
- Modify: `frontend/src/App.tsx:60` (add route)
- Modify: `frontend/src/pages/AlertsPage.tsx` (add Ack All Info button)

- [ ] **Step 1: Add AlertRulesPage route in App.tsx**

Import and add route alongside existing alerts route:

```typescript
import AlertRulesPage from '@/pages/AlertRulesPage';
```

Add in the routes section, near the existing `/alerts` route:

```typescript
<Route path="/alerts/rules" element={<AlertRulesPage />} />
```

Note: `/alerts/rules` must be placed before `/alerts` if using exact matching, or both can coexist since they are different paths.

- [ ] **Step 2: Add "Acknowledge All Info" button to AlertsPage**

In `AlertsPage.tsx`, import and use the new hook:

```typescript
import { useAcknowledgeAllInfo } from '@/lib/hooks';
```

Add the hook and button in the component:

```typescript
const ackAllInfo = useAcknowledgeAllInfo();

// Count unresolved info events
const unresolvedInfoCount = events?.filter(
  (e: any) => e.severity === 'info' && !e.resolved_at && !e.acknowledged_by
).length ?? 0;
```

Add button in the header area (next to the severity filter):

```tsx
{unresolvedInfoCount > 0 && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => {
      if (window.confirm(t('alertEvents.ackAllInfoConfirm', { count: unresolvedInfoCount }))) {
        ackAllInfo.mutate(currentSite!.id);
      }
    }}
    disabled={ackAllInfo.isPending}
  >
    {t('alertEvents.ackAllInfo')}
  </Button>
)}
```

- [ ] **Step 3: Verify frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/AlertsPage.tsx
git commit -m "feat: add alert rules route and ack-all-info button"
```

---

## Task 16: Frontend — Add navigation link to Alert Rules

**Files:**
- Modify: Navigation component (likely `frontend/src/components/layout/Sidebar.tsx` or `TopNav.tsx`)

- [ ] **Step 1: Find and update navigation**

Add a navigation link to `/alerts/rules` in the sidebar/nav alongside the existing `/alerts` link. Use `t('alertRules.title')` for the label.

The exact file depends on the navigation component used — check `Sidebar.tsx` or the layout component for the existing `/alerts` link pattern and add a sibling entry.

- [ ] **Step 2: Verify frontend build and manual test**

Run: `cd frontend && npm run build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/
git commit -m "feat: add Alert Rules navigation link"
```

---

## Task 17: Manual integration test

- [ ] **Step 1: Start backend and frontend**

```bash
make dev          # terminal 1
cd frontend && npm run dev  # terminal 2
```

- [ ] **Step 2: Verify Alert Rules page loads**

Navigate to `/alerts/rules`. Should show empty table with "Create Alert Rule" button.

- [ ] **Step 3: Test create flow**

Click "Create Alert Rule", select a machine, select a metric, verify the form adapts (analog shows condition+threshold, coil shows ON/OFF). Submit and verify the rule appears in the table.

- [ ] **Step 4: Test edit and delete**

Edit an existing rule, verify pre-populated values. Delete a rule, verify confirmation dialog.

- [ ] **Step 5: Test multi-select bulk actions**

Select multiple rules, verify action bar appears. Test Enable/Disable/Delete bulk actions.

- [ ] **Step 6: Test Ack All Info**

Navigate to `/alerts`, verify "Acknowledge All Info" button appears when info events exist.

- [ ] **Step 7: Test i18n**

Switch language to zh-TW, verify all alert rules strings are translated.
