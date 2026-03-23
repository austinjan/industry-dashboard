# Custom Dashboard Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a drag-and-drop custom dashboard builder with 9 widget types, full-screen editor, per-widget config panels, and role-based dashboard access.

**Architecture:** Full client-side builder using react-grid-layout for the 12-column grid. Backend provides CRUD for dashboards, widgets (batch save), and role access. Each widget type has a React component that fetches its own data via TanStack Query hooks. Full-screen editor mode exits the app shell for real-size editing.

**Tech Stack:** Go (chi, pgx), React 18, TypeScript, react-grid-layout, Recharts, shadcn/ui, TanStack Query, react-markdown

---

## File Structure

### Backend

```
migrations/
  010_create_dashboard_access.up.sql    # CREATE — dashboard_role_access table
  010_create_dashboard_access.down.sql
  011_seed_widget_types.up.sql          # CREATE — seed 9 widget types
  011_seed_widget_types.down.sql
internal/
  dashboard/
    store.go                            # CREATE — dashboard CRUD, widget batch save, access control
    handler.go                          # CREATE — dashboard API endpoints
cmd/server/main.go                      # MODIFY — wire dashboard routes
```

### Frontend

```
frontend/src/
  lib/
    hooks.ts                            # MODIFY — add dashboard hooks + useLatestValues
  components/
    widgets/
      WidgetRenderer.tsx                # CREATE — dispatches to correct widget component
      StatusCardWidget.tsx              # CREATE
      GaugeWidget.tsx                   # CREATE
      LineChartWidget.tsx               # CREATE
      BarChartWidget.tsx                # CREATE
      PieChartWidget.tsx                # CREATE
      DataTableWidget.tsx               # CREATE
      AlertListWidget.tsx               # CREATE
      MachineStatusWidget.tsx           # CREATE
      TextWidget.tsx                    # CREATE
    widget-config/
      WidgetConfigSheet.tsx             # CREATE — side sheet that dispatches to correct config form
      StatusCardConfig.tsx              # CREATE
      LineChartConfig.tsx               # CREATE
      BarChartConfig.tsx                # CREATE
      AlertListConfig.tsx               # CREATE
      MachineStatusConfig.tsx           # CREATE
      TextConfig.tsx                    # CREATE
      CommonFields.tsx                  # CREATE — shared form fields (machine picker, metric picker, time range)
  pages/
    dashboards/
      DashboardListPage.tsx             # CREATE — list/create/delete dashboards
      DashboardViewPage.tsx             # CREATE — read-only view
      DashboardEditorPage.tsx           # CREATE — full-screen editor with grid
      ShareDialog.tsx                   # CREATE — role access assignment
  App.tsx                               # MODIFY — add dashboard routes (editor outside AppShell)
```

---

### Task 1: Database Migration — Dashboard Access & Widget Types

**Files:**
- Create: `migrations/010_create_dashboard_access.up.sql`, `migrations/010_create_dashboard_access.down.sql`
- Create: `migrations/011_seed_widget_types.up.sql`, `migrations/011_seed_widget_types.down.sql`

- [ ] **Step 1: Create dashboard access migration**

Create `migrations/010_create_dashboard_access.up.sql`:

```sql
CREATE TABLE dashboard_role_access (
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    access_level VARCHAR(10) NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
    PRIMARY KEY (dashboard_id, role_id)
);

CREATE INDEX idx_dashboard_role_access_role ON dashboard_role_access(role_id);
```

Create `migrations/010_create_dashboard_access.down.sql`:

```sql
DROP TABLE IF EXISTS dashboard_role_access;
```

- [ ] **Step 2: Create widget types seed migration**

Create `migrations/011_seed_widget_types.up.sql`:

```sql
INSERT INTO widget_types (name, description, default_config) VALUES
    ('status_card', 'Single metric value with trend indicator', '{"width": 3, "height": 2}'),
    ('gauge', 'Radial gauge for OEE, utilization', '{"width": 3, "height": 3}'),
    ('line_chart', 'Time-series trend (multi-metric)', '{"width": 6, "height": 3}'),
    ('bar_chart', 'Compare values across machines or lines', '{"width": 6, "height": 3}'),
    ('pie_chart', 'Proportional breakdown', '{"width": 4, "height": 3}'),
    ('data_table', 'Sortable/filterable tabular data', '{"width": 6, "height": 4}'),
    ('alert_list', 'Filtered alert feed', '{"width": 4, "height": 3}'),
    ('machine_status', 'Compact machine overview grid', '{"width": 6, "height": 3}'),
    ('text_markdown', 'Free text notes with markdown support', '{"width": 4, "height": 2}');
```

Create `migrations/011_seed_widget_types.down.sql`:

```sql
DELETE FROM widget_types;
```

- [ ] **Step 3: Commit**

```bash
git add migrations/010_* migrations/011_*
git commit -m "feat: add dashboard_role_access table and seed widget types"
```

---

### Task 2: Backend — Dashboard Store & Handler

**Files:**
- Create: `internal/dashboard/store.go`
- Create: `internal/dashboard/handler.go`

- [ ] **Step 1: Create dashboard store**

Create `internal/dashboard/store.go`:

```go
package dashboard

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type Dashboard struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	OwnerID     string    `json:"owner_id"`
	SiteID      string    `json:"site_id"`
	LayoutType  string    `json:"layout_type"`
	IsShared    bool      `json:"is_shared"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	AccessLevel string    `json:"access_level,omitempty"`
}

type Widget struct {
	ID         string                 `json:"id"`
	WidgetType string                 `json:"widget_type"`
	PositionX  int                    `json:"position_x"`
	PositionY  int                    `json:"position_y"`
	Width      int                    `json:"width"`
	Height     int                    `json:"height"`
	Config     map[string]interface{} `json:"config"`
}

type DashboardWithWidgets struct {
	Dashboard
	Widgets []Widget `json:"widgets"`
}

type RoleAccess struct {
	RoleID      string `json:"role_id"`
	RoleName    string `json:"role_name"`
	AccessLevel string `json:"access_level"`
}

type WidgetType struct {
	ID            string                 `json:"id"`
	Name          string                 `json:"name"`
	Description   string                 `json:"description"`
	DefaultConfig map[string]interface{} `json:"default_config"`
}

func (s *Store) ListDashboards(ctx context.Context, userID, siteID string, userRoleIDs []string, isAdmin bool) ([]Dashboard, error) {
	query := `
		SELECT DISTINCT d.id, d.title, d.owner_id, d.site_id, d.layout_type, d.is_shared, d.created_at, d.updated_at,
			CASE
				WHEN d.owner_id = $1 THEN 'edit'
				WHEN $4 = true THEN 'edit'
				ELSE COALESCE(
					(SELECT dra.access_level FROM dashboard_role_access dra
					 WHERE dra.dashboard_id = d.id AND dra.role_id = ANY($3)
					 ORDER BY CASE WHEN dra.access_level = 'edit' THEN 0 ELSE 1 END
					 LIMIT 1), 'none')
			END as access_level
		FROM dashboards d
		WHERE d.site_id = $2
		AND (d.owner_id = $1 OR $4 = true
			OR EXISTS (SELECT 1 FROM dashboard_role_access dra WHERE dra.dashboard_id = d.id AND dra.role_id = ANY($3)))
		ORDER BY d.updated_at DESC`

	rows, err := s.db.Query(ctx, query, userID, siteID, userRoleIDs, isAdmin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var dashboards []Dashboard
	for rows.Next() {
		var d Dashboard
		if err := rows.Scan(&d.ID, &d.Title, &d.OwnerID, &d.SiteID, &d.LayoutType, &d.IsShared, &d.CreatedAt, &d.UpdatedAt, &d.AccessLevel); err != nil {
			return nil, err
		}
		dashboards = append(dashboards, d)
	}
	return dashboards, rows.Err()
}

func (s *Store) GetDashboard(ctx context.Context, id string) (*DashboardWithWidgets, error) {
	var d DashboardWithWidgets
	err := s.db.QueryRow(ctx,
		`SELECT id, title, owner_id, site_id, layout_type, is_shared, created_at, updated_at
		 FROM dashboards WHERE id = $1`, id,
	).Scan(&d.ID, &d.Title, &d.OwnerID, &d.SiteID, &d.LayoutType, &d.IsShared, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx,
		`SELECT id, widget_type, position_x, position_y, width, height, config
		 FROM dashboard_widgets WHERE dashboard_id = $1 ORDER BY position_y, position_x`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var w Widget
		var configBytes []byte
		if err := rows.Scan(&w.ID, &w.WidgetType, &w.PositionX, &w.PositionY, &w.Width, &w.Height, &configBytes); err != nil {
			return nil, err
		}
		if configBytes != nil {
			json.Unmarshal(configBytes, &w.Config)
		}
		d.Widgets = append(d.Widgets, w)
	}
	return &d, rows.Err()
}

func (s *Store) CreateDashboard(ctx context.Context, title, ownerID, siteID string) (*Dashboard, error) {
	var d Dashboard
	err := s.db.QueryRow(ctx,
		`INSERT INTO dashboards (title, owner_id, site_id)
		 VALUES ($1, $2, $3)
		 RETURNING id, title, owner_id, site_id, layout_type, is_shared, created_at, updated_at`,
		title, ownerID, siteID,
	).Scan(&d.ID, &d.Title, &d.OwnerID, &d.SiteID, &d.LayoutType, &d.IsShared, &d.CreatedAt, &d.UpdatedAt)
	return &d, err
}

func (s *Store) UpdateDashboard(ctx context.Context, id, title string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE dashboards SET title = $1, updated_at = NOW() WHERE id = $2`, title, id)
	return err
}

func (s *Store) DeleteDashboard(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM dashboards WHERE id = $1`, id)
	return err
}

func (s *Store) SaveWidgets(ctx context.Context, dashboardID string, widgets []Widget) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Delete existing widgets
	_, err = tx.Exec(ctx, `DELETE FROM dashboard_widgets WHERE dashboard_id = $1`, dashboardID)
	if err != nil {
		return err
	}

	// Insert new widgets
	for _, w := range widgets {
		configBytes, _ := json.Marshal(w.Config)
		_, err = tx.Exec(ctx,
			`INSERT INTO dashboard_widgets (dashboard_id, widget_type, position_x, position_y, width, height, config)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			dashboardID, w.WidgetType, w.PositionX, w.PositionY, w.Width, w.Height, configBytes)
		if err != nil {
			return err
		}
	}

	// Update dashboard timestamp
	_, err = tx.Exec(ctx, `UPDATE dashboards SET updated_at = NOW() WHERE id = $1`, dashboardID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *Store) GetAccess(ctx context.Context, dashboardID string) ([]RoleAccess, error) {
	rows, err := s.db.Query(ctx,
		`SELECT dra.role_id, r.name, dra.access_level
		 FROM dashboard_role_access dra
		 JOIN roles r ON dra.role_id = r.id
		 WHERE dra.dashboard_id = $1
		 ORDER BY r.name`, dashboardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var access []RoleAccess
	for rows.Next() {
		var a RoleAccess
		if err := rows.Scan(&a.RoleID, &a.RoleName, &a.AccessLevel); err != nil {
			return nil, err
		}
		access = append(access, a)
	}
	return access, rows.Err()
}

func (s *Store) SetAccess(ctx context.Context, dashboardID string, access []RoleAccess) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM dashboard_role_access WHERE dashboard_id = $1`, dashboardID)
	if err != nil {
		return err
	}

	for _, a := range access {
		_, err = tx.Exec(ctx,
			`INSERT INTO dashboard_role_access (dashboard_id, role_id, access_level) VALUES ($1, $2, $3)`,
			dashboardID, a.RoleID, a.AccessLevel)
		if err != nil {
			return err
		}
	}

	// Update is_shared flag
	hasAccess := len(access) > 0
	_, err = tx.Exec(ctx, `UPDATE dashboards SET is_shared = $1, updated_at = NOW() WHERE id = $2`, hasAccess, dashboardID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (s *Store) ListWidgetTypes(ctx context.Context) ([]WidgetType, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, name, description, default_config FROM widget_types ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var types []WidgetType
	for rows.Next() {
		var t WidgetType
		var configBytes []byte
		if err := rows.Scan(&t.ID, &t.Name, &t.Description, &configBytes); err != nil {
			return nil, err
		}
		if configBytes != nil {
			json.Unmarshal(configBytes, &t.DefaultConfig)
		}
		types = append(types, t)
	}
	return types, rows.Err()
}

func (s *Store) GetOwnerID(ctx context.Context, dashboardID string) (string, error) {
	var ownerID string
	err := s.db.QueryRow(ctx, `SELECT owner_id FROM dashboards WHERE id = $1`, dashboardID).Scan(&ownerID)
	return ownerID, err
}
```

Add `"encoding/json"` to the import block.

- [ ] **Step 2: Create dashboard handler**

Create `internal/dashboard/handler.go`:

```go
package dashboard

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/auth"
	"github.com/industry-dashboard/server/internal/rbac"
)

type Handler struct {
	store     *Store
	rbacStore *rbac.Store
}

func NewHandler(store *Store, rbacStore *rbac.Store) *Handler {
	return &Handler{store: store, rbacStore: rbacStore}
}

func (h *Handler) ListDashboards(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id required", http.StatusBadRequest)
		return
	}

	isAdmin, _ := h.rbacStore.IsGlobalAdmin(r.Context(), claims.UserID)

	// Get user's role IDs at this site
	roles, _ := h.rbacStore.GetUserRolesAtSite(r.Context(), claims.UserID, siteID)
	roleIDs := make([]string, len(roles))
	for i, r := range roles {
		roleIDs[i] = r
	}

	dashboards, err := h.store.ListDashboards(r.Context(), claims.UserID, siteID, roleIDs, isAdmin)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboards)
}

func (h *Handler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "dashboardID")
	dashboard, err := h.store.GetDashboard(r.Context(), id)
	if err != nil {
		http.Error(w, "dashboard not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dashboard)
}

func (h *Handler) CreateDashboard(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetClaims(r.Context())
	var body struct {
		Title  string `json:"title"`
		SiteID string `json:"site_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Title == "" || body.SiteID == "" {
		http.Error(w, "title and site_id required", http.StatusBadRequest)
		return
	}
	dashboard, err := h.store.CreateDashboard(r.Context(), body.Title, claims.UserID, body.SiteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(dashboard)
}

func (h *Handler) UpdateDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "dashboardID")
	var body struct {
		Title string `json:"title"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := h.store.UpdateDashboard(r.Context(), id, body.Title); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteDashboard(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "dashboardID")
	if err := h.store.DeleteDashboard(r.Context(), id); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) SaveWidgets(w http.ResponseWriter, r *http.Request) {
	dashboardID := chi.URLParam(r, "dashboardID")
	var body struct {
		Widgets []Widget `json:"widgets"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := h.store.SaveWidgets(r.Context(), dashboardID, body.Widgets); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetAccess(w http.ResponseWriter, r *http.Request) {
	dashboardID := chi.URLParam(r, "dashboardID")
	access, err := h.store.GetAccess(r.Context(), dashboardID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(access)
}

func (h *Handler) SetAccess(w http.ResponseWriter, r *http.Request) {
	dashboardID := chi.URLParam(r, "dashboardID")
	var body struct {
		Access []RoleAccess `json:"access"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if err := h.store.SetAccess(r.Context(), dashboardID, body.Access); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListWidgetTypes(w http.ResponseWriter, r *http.Request) {
	types, err := h.store.ListWidgetTypes(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(types)
}
```

- [ ] **Step 3: Add `GetUserRolesAtSite` to RBAC store**

Add to `internal/rbac/store.go`:

```go
func (s *Store) GetUserRolesAtSite(ctx context.Context, userID, siteID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT role_id FROM user_site_roles WHERE user_id = $1 AND (site_id = $2 OR site_id IS NULL)`,
		userID, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roleIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		roleIDs = append(roleIDs, id)
	}
	return roleIDs, rows.Err()
}
```

- [ ] **Step 4: Wire dashboard routes in main.go**

Add import `"github.com/industry-dashboard/server/internal/dashboard"` and initialization:

```go
dashboardStore := dashboard.NewStore(pool)
dashboardHandler := dashboard.NewHandler(dashboardStore, rbacStore)
```

Add routes inside the protected `/api` group:

```go
// Dashboards
r.Route("/dashboards", func(r chi.Router) {
	r.With(rbacMW.Require("dashboard:view", rbac.SiteFromQuery)).Get("/", dashboardHandler.ListDashboards)
	r.With(rbacMW.Require("dashboard:create", rbac.SiteFromQuery), auditMW.Log("dashboard", "create")).Post("/", dashboardHandler.CreateDashboard)
	r.Route("/{dashboardID}", func(r chi.Router) {
		r.Get("/", dashboardHandler.GetDashboard)
		r.With(auditMW.Log("dashboard", "update")).Put("/", dashboardHandler.UpdateDashboard)
		r.With(rbacMW.Require("dashboard:delete", rbac.SiteFromQuery), auditMW.Log("dashboard", "delete")).Delete("/", dashboardHandler.DeleteDashboard)
		r.With(auditMW.Log("dashboard", "save_widgets")).Put("/widgets", dashboardHandler.SaveWidgets)
		r.Get("/access", dashboardHandler.GetAccess)
		r.With(rbacMW.Require("dashboard:share", rbac.SiteFromQuery), auditMW.Log("dashboard", "set_access")).Put("/access", dashboardHandler.SetAccess)
	})
})

// Widget types
r.Get("/widget-types", dashboardHandler.ListWidgetTypes)
```

- [ ] **Step 5: Verify compilation**

```bash
go build ./...
```

- [ ] **Step 6: Commit**

```bash
git add internal/dashboard/ internal/rbac/store.go cmd/server/main.go
git commit -m "feat: add dashboard CRUD, widget batch save, and role access endpoints"
```

---

### Task 3: Install react-grid-layout & react-markdown, Add Dashboard Hooks

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/lib/hooks.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd frontend
npm install react-grid-layout react-markdown
npm install -D @types/react-grid-layout
```

- [ ] **Step 2: Add dashboard hooks to hooks.ts**

Add to `frontend/src/lib/hooks.ts`:

```typescript
// Dashboards
export function useDashboards(siteId: string | undefined) {
  return useQuery({
    queryKey: ['dashboards', siteId],
    queryFn: () => fetchJSON<any[]>(`/dashboards?site_id=${siteId}`),
    enabled: !!siteId,
  });
}

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => fetchJSON<any>(`/dashboards/${id}`),
    enabled: !!id,
  });
}

export function useWidgetTypes() {
  return useQuery({
    queryKey: ['widget-types'],
    queryFn: () => fetchJSON<any[]>('/widget-types'),
  });
}

export function useDashboardAccess(id: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-access', id],
    queryFn: () => fetchJSON<any[]>(`/dashboards/${id}/access`),
    enabled: !!id,
  });
}

export function useCreateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; site_id: string }) =>
      apiFetch('/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

export function useUpdateDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiFetch(`/dashboards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

export function useDeleteDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/dashboards/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards'] }),
  });
}

export function useSaveWidgets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, widgets }: { dashboardId: string; widgets: any[] }) =>
      apiFetch(`/dashboards/${dashboardId}/widgets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ widgets }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['dashboard', vars.dashboardId] }),
  });
}

export function useSetDashboardAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, access }: { dashboardId: string; access: any[] }) =>
      apiFetch(`/dashboards/${dashboardId}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['dashboard-access', vars.dashboardId] }),
  });
}

// Latest values for a machine (used by status_card, gauge, machine_status widgets)
export function useLatestValues(machineId: string | undefined) {
  return useQuery({
    queryKey: ['machine-latest', machineId],
    queryFn: () => fetchJSON<Record<string, number>>(`/machines/${machineId}/latest`),
    enabled: !!machineId,
    refetchInterval: 30000,
  });
}
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
cd ..
git add frontend/
git commit -m "feat: add react-grid-layout, react-markdown, and dashboard hooks"
```

---

### Task 4: Widget Renderer Components

**Files:**
- Create: `frontend/src/components/widgets/WidgetRenderer.tsx`
- Create: `frontend/src/components/widgets/StatusCardWidget.tsx`
- Create: `frontend/src/components/widgets/LineChartWidget.tsx`
- Create: `frontend/src/components/widgets/BarChartWidget.tsx`
- Create: `frontend/src/components/widgets/PieChartWidget.tsx`
- Create: `frontend/src/components/widgets/AlertListWidget.tsx`
- Create: `frontend/src/components/widgets/MachineStatusWidget.tsx`
- Create: `frontend/src/components/widgets/TextWidget.tsx`
- Create: `frontend/src/components/widgets/GaugeWidget.tsx`
- Create: `frontend/src/components/widgets/DataTableWidget.tsx`

Create all 10 widget components. Each reads its `config` prop and fetches data using hooks.

**WidgetRenderer.tsx** dispatches to the correct component:
```tsx
import { StatusCardWidget } from './StatusCardWidget';
import { GaugeWidget } from './GaugeWidget';
import { LineChartWidget } from './LineChartWidget';
import { BarChartWidget } from './BarChartWidget';
import { PieChartWidget } from './PieChartWidget';
import { DataTableWidget } from './DataTableWidget';
import { AlertListWidget } from './AlertListWidget';
import { MachineStatusWidget } from './MachineStatusWidget';
import { TextWidget } from './TextWidget';

interface Props {
  widgetType: string;
  config: Record<string, any>;
}

const WIDGETS: Record<string, React.FC<{ config: Record<string, any> }>> = {
  status_card: StatusCardWidget,
  gauge: GaugeWidget,
  line_chart: LineChartWidget,
  bar_chart: BarChartWidget,
  pie_chart: PieChartWidget,
  data_table: DataTableWidget,
  alert_list: AlertListWidget,
  machine_status: MachineStatusWidget,
  text_markdown: TextWidget,
};

export function WidgetRenderer({ widgetType, config }: Props) {
  const Component = WIDGETS[widgetType];
  if (!Component) return <div className="p-2 text-sm text-red-500">Unknown widget: {widgetType}</div>;
  return <Component config={config} />;
}
```

Each widget component is a small focused file (20-50 lines) that:
1. Destructures its config
2. Calls the appropriate hook (e.g., `useLatestValues`, `useDataPoints`, `useAlertEvents`)
3. Renders using existing chart/UI components

**StatusCardWidget.tsx:**
```tsx
import { useLatestValues } from '@/lib/hooks';

export function StatusCardWidget({ config }: { config: Record<string, any> }) {
  const { data: latest } = useLatestValues(config.machine_id);
  const value = latest?.[config.metric];
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-xs text-slate-500">{config.title || config.metric}</p>
      <p className="text-2xl font-bold">{value !== undefined ? `${value.toFixed(1)}${config.unit || ''}` : '--'}</p>
    </div>
  );
}
```

**LineChartWidget.tsx:**
```tsx
import { useDataPoints } from '@/lib/hooks';
import { LineChart } from '@/components/charts/LineChart';

export function LineChartWidget({ config }: { config: Record<string, any> }) {
  const metric = config.metrics?.[0] || config.metric || '';
  const { data } = useDataPoints(config.machine_id, metric, config.time_range || '24h');
  return (
    <div className="h-full">
      <p className="mb-1 text-xs text-slate-500">{config.title || 'Line Chart'}</p>
      {data && data.length > 0 ? (
        <LineChart data={data} yLabel={metric} />
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">No data</p>
      )}
    </div>
  );
}
```

**BarChartWidget.tsx:**
```tsx
import { BarChart } from '@/components/charts/BarChart';

export function BarChartWidget({ config }: { config: Record<string, any> }) {
  // TODO: When real aggregation endpoint exists, use it. For now show placeholder.
  return (
    <div className="h-full">
      <p className="mb-1 text-xs text-slate-500">{config.title || 'Bar Chart'}</p>
      <p className="py-4 text-center text-xs text-slate-400">Configure data source to display chart</p>
    </div>
  );
}
```

**PieChartWidget.tsx:**
```tsx
export function PieChartWidget({ config }: { config: Record<string, any> }) {
  return (
    <div className="h-full">
      <p className="mb-1 text-xs text-slate-500">{config.title || 'Pie Chart'}</p>
      <p className="py-4 text-center text-xs text-slate-400">Configure data source to display chart</p>
    </div>
  );
}
```

**DataTableWidget.tsx:**
```tsx
import { useLineMachines } from '@/lib/hooks';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function DataTableWidget({ config }: { config: Record<string, any> }) {
  const { data: machines } = useLineMachines(config.line_id);
  return (
    <div className="h-full overflow-auto">
      <p className="mb-1 text-xs text-slate-500">{config.title || 'Data Table'}</p>
      {machines && machines.length > 0 ? (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Model</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {machines.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.model}</TableCell>
                <TableCell>{m.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="py-4 text-center text-xs text-slate-400">No data</p>
      )}
    </div>
  );
}
```

**AlertListWidget.tsx:**
```tsx
import { Badge } from '@/components/ui/badge';
import { useAlertEvents } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

export function AlertListWidget({ config }: { config: Record<string, any> }) {
  const { currentSite } = useSite();
  const { data: events } = useAlertEvents(currentSite?.id, { limit: String(config.limit || 5) });
  return (
    <div className="h-full overflow-auto">
      <p className="mb-1 text-xs text-slate-500">{config.title || 'Alerts'}</p>
      {events?.map((e: any) => (
        <div key={e.id} className="border-b py-1 text-xs">
          <Badge variant={e.severity === 'critical' ? 'destructive' : 'secondary'} className="mr-1 text-xs">{e.severity}</Badge>
          {e.machine_name} — {e.alert_name}
        </div>
      ))}
      {(!events || events.length === 0) && <p className="py-2 text-xs text-slate-400">No alerts</p>}
    </div>
  );
}
```

**MachineStatusWidget.tsx:**
```tsx
import { useLineMachines } from '@/lib/hooks';

export function MachineStatusWidget({ config }: { config: Record<string, any> }) {
  const { data: machines } = useLineMachines(config.line_id);
  const statusColor: Record<string, string> = { running: 'bg-green-100 text-green-800', offline: 'bg-slate-100 text-slate-600', error: 'bg-red-100 text-red-800' };
  return (
    <div className="h-full overflow-auto">
      <p className="mb-2 text-xs text-slate-500">{config.title || 'Machine Status'}</p>
      <div className="grid grid-cols-3 gap-2">
        {machines?.map((m: any) => (
          <div key={m.id} className={`rounded-md p-2 text-center text-xs ${statusColor[m.status] || 'bg-slate-50'}`}>
            <div className="font-semibold">{m.name}</div>
            <div className="capitalize">{m.status}</div>
          </div>
        ))}
      </div>
      {(!machines || machines.length === 0) && <p className="py-2 text-xs text-slate-400">No machines</p>}
    </div>
  );
}
```

**GaugeWidget.tsx:**
```tsx
import { useLatestValues } from '@/lib/hooks';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

export function GaugeWidget({ config }: { config: Record<string, any> }) {
  const { data: latest } = useLatestValues(config.machine_id);
  const value = latest?.[config.metric] ?? 0;
  const max = config.max || 100;
  const pct = Math.min((value / max) * 100, 100);
  const data = [{ value: pct, fill: pct > 80 ? '#22c55e' : pct > 50 ? '#f59e0b' : '#ef4444' }];
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <p className="text-xs text-slate-500">{config.title || 'Gauge'}</p>
      <ResponsiveContainer width="100%" height={120}>
        <RadialBarChart innerRadius="60%" outerRadius="90%" data={data} startAngle={180} endAngle={0}>
          <RadialBar dataKey="value" background cornerRadius={4} />
        </RadialBarChart>
      </ResponsiveContainer>
      <p className="text-lg font-bold">{value.toFixed(1)}</p>
    </div>
  );
}
```

**TextWidget.tsx:**
```tsx
import ReactMarkdown from 'react-markdown';

export function TextWidget({ config }: { config: Record<string, any> }) {
  return (
    <div className="h-full overflow-auto prose prose-sm max-w-none">
      <ReactMarkdown>{config.content || '*No content*'}</ReactMarkdown>
    </div>
  );
}
```

Verify build. Commit: `git commit -m "feat: add 9 widget renderer components with data fetching"`

---

### Task 5: Widget Config Forms

**Files:**
- Create: `frontend/src/components/widget-config/CommonFields.tsx`
- Create: `frontend/src/components/widget-config/WidgetConfigSheet.tsx`
- Create: `frontend/src/components/widget-config/StatusCardConfig.tsx`
- Create: `frontend/src/components/widget-config/LineChartConfig.tsx`
- Create: `frontend/src/components/widget-config/BarChartConfig.tsx`
- Create: `frontend/src/components/widget-config/AlertListConfig.tsx`
- Create: `frontend/src/components/widget-config/MachineStatusConfig.tsx`
- Create: `frontend/src/components/widget-config/TextConfig.tsx`

**CommonFields.tsx** provides shared form components (machine picker, metric picker, time range) that multiple config forms reuse.

**WidgetConfigSheet.tsx** is the Sheet wrapper that dispatches to the correct config form based on widget type.

Each config form:
1. Shows a colored hint box explaining the widget
2. Has step-by-step fields with helper text
3. Auto-populates dropdowns from hooks (machines, lines, metrics)
4. Calls `onSave(config)` when Apply is clicked

Full code for each config form component should follow the pattern shown in the brainstorming visual (hint box, step-by-step fields, helper text, Apply/Cancel).

Verify build. Commit: `git commit -m "feat: add widget config sheet with per-type config forms"`

---

### Task 6: Dashboard List Page

**Files:**
- Create: `frontend/src/pages/dashboards/DashboardListPage.tsx`
- Modify: `frontend/src/App.tsx`

Dashboard list showing cards for each dashboard the user has access to. Create button opens a dialog to enter title. Each card shows widget count, role access badges, and view/edit/delete actions based on access level.

Verify build. Commit: `git commit -m "feat: add dashboard list page with create and delete"`

---

### Task 7: Dashboard Editor Page (Full-Screen)

**Files:**
- Create: `frontend/src/pages/dashboards/DashboardEditorPage.tsx`
- Modify: `frontend/src/App.tsx`

Full-screen editor with:
1. Floating toolbar (title, + Add Widget, Share, Cancel, Save)
2. Widget picker popover (3x3 grid)
3. react-grid-layout 12-column grid
4. WidgetConfigSheet opens when clicking widget settings
5. Save calls `useSaveWidgets` with full layout

The editor route `/dashboards/:id/edit` and `/dashboards/new` should be OUTSIDE the AppShell Route group (no sidebar/topnav) but still inside ProtectedRoute and SiteProvider.

Verify build. Commit: `git commit -m "feat: add full-screen dashboard editor with drag-and-drop grid"`

---

### Task 8: Dashboard View Page

**Files:**
- Create: `frontend/src/pages/dashboards/DashboardViewPage.tsx`
- Modify: `frontend/src/App.tsx`

Read-only view of a saved dashboard. Uses the same WidgetRenderer components but without drag-and-drop. Uses react-grid-layout with `isDraggable={false}` and `isResizable={false}`. Shows an "Edit" button if user has edit access.

Verify build. Commit: `git commit -m "feat: add dashboard view page (read-only rendering)"`

---

### Task 9: Share Dialog

**Files:**
- Create: `frontend/src/pages/dashboards/ShareDialog.tsx`

Dialog component used by the editor. Lists all roles with a dropdown per role: "No access" / "View" / "Edit". Saves via `useSetDashboardAccess`.

Verify build. Commit: `git commit -m "feat: add share dialog for role-based dashboard access"`

---

### Task 10: Route Wiring & Final Verification

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Final route wiring**

In App.tsx, ensure all dashboard routes are properly set up:
- `/dashboards` inside AppShell (list page)
- `/dashboards/:id` inside AppShell (view page)
- `/dashboards/new` OUTSIDE AppShell (full-screen editor, but inside ProtectedRoute+SiteProvider)
- `/dashboards/:id/edit` OUTSIDE AppShell (full-screen editor, but inside ProtectedRoute+SiteProvider)

- [ ] **Step 2: Update Sidebar**

Replace the "My Dashboards" placeholder link to point to `/dashboards`.

- [ ] **Step 3: Update CLAUDE.md**

Add `dashboard/` to the backend structure.

- [ ] **Step 4: Verify everything**

```bash
go build ./...
go test ./...
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire dashboard routes, update sidebar and CLAUDE.md"
```
