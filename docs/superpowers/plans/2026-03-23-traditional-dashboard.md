# Traditional Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all fixed dashboard pages — site overview, machine detail, alerts, RBAC admin, audit log viewer — with real API data binding and chart visualizations.

**Architecture:** Extend the existing Go REST API with missing endpoints (data aggregation, alert CRUD, user listing). Build 7 frontend pages using TanStack Query for data fetching, Recharts for charts, and existing shadcn/ui components. Add a site context provider so all pages know which site is selected. WebSocket real-time updates are deferred to sub-project 2 (Modbus workers) since there's no live data source yet.

**Tech Stack:** Go (chi, pgx), React 18, TypeScript, TanStack Query, Recharts, shadcn/ui, Tailwind CSS

---

## File Structure

### Backend (new/modified files)

```
internal/
  site/
    store.go              # MODIFY — add GetSite, site summary (machine counts, alert counts)
    handler.go            # MODIFY — add GetSite, GetSiteSummary endpoints
  alert/
    store.go              # CREATE — alert CRUD, list with filters, acknowledge
    handler.go            # CREATE — alert endpoints
  user/
    store.go              # CREATE — user listing, user detail with roles
    handler.go            # CREATE — user list/detail endpoints
  datapoint/
    store.go              # CREATE — time-series queries, aggregations
    handler.go            # CREATE — data query endpoints
cmd/server/main.go        # MODIFY — wire new handlers and routes
```

### Frontend (new/modified files)

```
frontend/src/
  lib/
    site-context.tsx       # CREATE — site selection context (shared across all pages)
    hooks.ts               # CREATE — TanStack Query hooks for API calls
  components/
    layout/
      TopNav.tsx           # MODIFY — add site selector dropdown
      Sidebar.tsx          # MODIFY — add production lines link
    charts/
      LineChart.tsx         # CREATE — reusable Recharts line chart wrapper
      BarChart.tsx          # CREATE — reusable Recharts bar chart wrapper
      PieChart.tsx          # CREATE — reusable Recharts pie chart wrapper
  pages/
    DashboardPage.tsx      # MODIFY — real data binding, line status, recent alerts
    MachineListPage.tsx    # CREATE — machine table with status indicators
    MachineDetailPage.tsx  # CREATE — single machine deep-dive with metrics
    AlertsPage.tsx         # CREATE — alert list, filters, acknowledge
    admin/
      UsersPage.tsx        # CREATE — user list with role assignments
      RolesPage.tsx        # CREATE — role editor with permission checkboxes
      AuditLogPage.tsx     # CREATE — searchable audit log table
```

---

### Task 1: Install Frontend Dependencies & Additional shadcn Components

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Recharts**

```bash
cd /Users/macmini-au/code/industry-dashboard/.worktrees/dashboard/frontend
npm install recharts
```

- [ ] **Step 2: Install additional shadcn/ui components**

```bash
npx shadcn@latest add tabs dialog form label textarea checkbox switch pagination tooltip scroll-area sheet popover -y
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Recharts and additional shadcn/ui components"
```

---

### Task 2: Site Context Provider & TopNav Site Selector

**Files:**
- Create: `frontend/src/lib/site-context.tsx`
- Modify: `frontend/src/components/layout/TopNav.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create site context**

Create `frontend/src/lib/site-context.tsx`:

```tsx
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiFetch } from './api';

interface Site {
  id: string;
  name: string;
  code: string;
  timezone: string;
}

interface SiteContextType {
  sites: Site[];
  currentSite: Site | null;
  setCurrentSite: (site: Site) => void;
  loading: boolean;
}

const SiteContext = createContext<SiteContextType>({
  sites: [],
  currentSite: null,
  setCurrentSite: () => {},
  loading: true,
});

export function SiteProvider({ children }: { children: ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/sites')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Site[]) => {
        setSites(data ?? []);
        if (data && data.length > 0) {
          const saved = localStorage.getItem('current_site_id');
          const match = data.find((s) => s.id === saved);
          setCurrentSite(match ?? data[0]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSetSite = (site: Site) => {
    setCurrentSite(site);
    localStorage.setItem('current_site_id', site.id);
  };

  return (
    <SiteContext.Provider value={{ sites, currentSite, setCurrentSite: handleSetSite, loading }}>
      {children}
    </SiteContext.Provider>
  );
}

export function useSite() {
  return useContext(SiteContext);
}
```

- [ ] **Step 2: Update TopNav with site selector**

Replace `frontend/src/components/layout/TopNav.tsx`:

```tsx
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site-context';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TopNav() {
  const { user, logout } = useAuth();
  const { sites, currentSite, setCurrentSite } = useSite();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-slate-900 px-4 text-white">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold">Industry Dashboard</h1>
        {sites.length > 0 && (
          <Select
            value={currentSite?.id ?? ''}
            onValueChange={(id) => {
              const site = sites.find((s) => s.id === id);
              if (site) setCurrentSite(site);
            }}
          >
            <SelectTrigger className="w-48 border-slate-700 bg-slate-800 text-white">
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-3">
        {user && (
          <>
            <span className="text-sm text-slate-300">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={logout} className="text-slate-300 hover:text-white">
              Logout
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Wrap App with SiteProvider**

In `frontend/src/App.tsx`, import `SiteProvider` and wrap the `ProtectedRoute` children:

```tsx
import { SiteProvider } from '@/lib/site-context';

// Inside ProtectedRoute, wrap AppShell:
<ProtectedRoute>
  <SiteProvider>
    <AppShell />
  </SiteProvider>
</ProtectedRoute>
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add site context provider and site selector in top nav"
```

---

### Task 3: TanStack Query Hooks

**Files:**
- Create: `frontend/src/lib/hooks.ts`

- [ ] **Step 1: Create API hooks**

Create `frontend/src/lib/hooks.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Sites
export function useSiteLines(siteId: string | undefined) {
  return useQuery({
    queryKey: ['lines', siteId],
    queryFn: () => fetchJSON<any[]>(`/sites/${siteId}/lines`),
    enabled: !!siteId,
  });
}

export function useLineMachines(lineId: string | undefined) {
  return useQuery({
    queryKey: ['machines', lineId],
    queryFn: () => fetchJSON<any[]>(`/lines/${lineId}/machines`),
    enabled: !!lineId,
  });
}

// Site summary (new endpoint — Task 4)
export function useSiteSummary(siteId: string | undefined) {
  return useQuery({
    queryKey: ['site-summary', siteId],
    queryFn: () => fetchJSON<any>(`/sites/${siteId}/summary`),
    enabled: !!siteId,
    refetchInterval: 30000,
  });
}

// Alerts
export function useAlerts(siteId: string | undefined, params?: Record<string, string>) {
  const query = new URLSearchParams({ site_id: siteId ?? '', ...params }).toString();
  return useQuery({
    queryKey: ['alerts', siteId, params],
    queryFn: () => fetchJSON<any[]>(`/alerts?${query}`),
    enabled: !!siteId,
  });
}

export function useAlertEvents(siteId: string | undefined, params?: Record<string, string>) {
  const query = new URLSearchParams({ site_id: siteId ?? '', ...params }).toString();
  return useQuery({
    queryKey: ['alert-events', siteId, params],
    queryFn: () => fetchJSON<any[]>(`/alert-events?${query}`),
    enabled: !!siteId,
    refetchInterval: 30000,
  });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) =>
      apiFetch(`/alert-events/${eventId}/acknowledge`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });
}

// Data points
export function useDataPoints(machineId: string | undefined, metric: string, timeRange: string) {
  return useQuery({
    queryKey: ['datapoints', machineId, metric, timeRange],
    queryFn: () => fetchJSON<any[]>(`/datapoints?machine_id=${machineId}&metric=${metric}&range=${timeRange}`),
    enabled: !!machineId,
  });
}

// Users (admin)
export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJSON<any[]>('/users'),
  });
}

// Roles
export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => fetchJSON<any[]>('/rbac/roles'),
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => fetchJSON<any[]>('/rbac/permissions'),
  });
}

export function useRolePermissions(roleId: string | undefined) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: () => fetchJSON<any[]>(`/rbac/roles/${roleId}/permissions`),
    enabled: !!roleId,
  });
}

// Audit logs
export function useAuditLogs(params?: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => fetchJSON<any[]>(`/audit-logs?${query}`),
  });
}

// Mutations
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description: string; permission_ids: string[] }) =>
      apiFetch('/rbac/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { user_id: string; role_id: string; site_id?: string }) =>
      apiFetch('/rbac/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useRemoveRoleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/rbac/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/hooks.ts
git commit -m "feat: add TanStack Query hooks for all API endpoints"
```

---

### Task 4: Backend — Site Summary, Alert, User, & DataPoint Endpoints

**Files:**
- Modify: `internal/site/store.go`, `internal/site/handler.go`
- Create: `internal/alert/store.go`, `internal/alert/handler.go`
- Create: `internal/user/store.go`, `internal/user/handler.go`
- Create: `internal/datapoint/store.go`, `internal/datapoint/handler.go`
- Modify: `cmd/server/main.go`

- [ ] **Step 1: Add site summary to site store**

Add to `internal/site/store.go`:

```go
type SiteSummary struct {
	TotalMachines  int `json:"total_machines"`
	OnlineMachines int `json:"online_machines"`
	ActiveAlerts   int `json:"active_alerts"`
	TotalLines     int `json:"total_lines"`
}

func (s *Store) GetSite(ctx context.Context, id string) (*Site, error) {
	var site Site
	err := s.db.QueryRow(ctx,
		`SELECT id, name, code, timezone, address, created_at FROM sites WHERE id = $1`, id,
	).Scan(&site.ID, &site.Name, &site.Code, &site.Timezone, &site.Address, &site.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &site, nil
}

func (s *Store) GetSiteSummary(ctx context.Context, siteID string) (*SiteSummary, error) {
	var summary SiteSummary
	err := s.db.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM machines m JOIN production_lines pl ON m.line_id = pl.id WHERE pl.site_id = $1) as total_machines,
			(SELECT COUNT(*) FROM machines m JOIN production_lines pl ON m.line_id = pl.id WHERE pl.site_id = $1 AND m.status = 'running') as online_machines,
			(SELECT COUNT(*) FROM alert_events ae JOIN alerts a ON ae.alert_id = a.id JOIN machines m ON a.machine_id = m.id JOIN production_lines pl ON m.line_id = pl.id WHERE pl.site_id = $1 AND ae.resolved_at IS NULL) as active_alerts,
			(SELECT COUNT(*) FROM production_lines WHERE site_id = $1) as total_lines
	`, siteID).Scan(&summary.TotalMachines, &summary.OnlineMachines, &summary.ActiveAlerts, &summary.TotalLines)
	return &summary, err
}
```

- [ ] **Step 2: Add site summary handler**

Add to `internal/site/handler.go`:

```go
func (h *Handler) GetSite(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	site, err := h.store.GetSite(r.Context(), siteID)
	if err != nil {
		http.Error(w, "site not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(site)
}

func (h *Handler) GetSiteSummary(w http.ResponseWriter, r *http.Request) {
	siteID := chi.URLParam(r, "siteID")
	summary, err := h.store.GetSiteSummary(r.Context(), siteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}
```

- [ ] **Step 3: Create alert store**

Create `internal/alert/store.go`:

```go
package alert

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
}

type AlertEvent struct {
	ID             string     `json:"id"`
	AlertID        string     `json:"alert_id"`
	AlertName      string     `json:"alert_name"`
	MachineName    string     `json:"machine_name"`
	Severity       string     `json:"severity"`
	TriggeredAt    time.Time  `json:"triggered_at"`
	ResolvedAt     *time.Time `json:"resolved_at"`
	AcknowledgedBy *string    `json:"acknowledged_by"`
}

func (s *Store) ListAlerts(ctx context.Context, siteID string) ([]Alert, error) {
	rows, err := s.db.Query(ctx,
		`SELECT a.id, a.name, a.machine_id, a.metric_name, a.condition, a.threshold, a.severity, a.is_active, a.created_at
		 FROM alerts a
		 JOIN machines m ON a.machine_id = m.id
		 JOIN production_lines pl ON m.line_id = pl.id
		 WHERE pl.site_id = $1
		 ORDER BY a.created_at DESC`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var alerts []Alert
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.Name, &a.MachineID, &a.MetricName, &a.Condition, &a.Threshold, &a.Severity, &a.IsActive, &a.CreatedAt); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

func (s *Store) ListAlertEvents(ctx context.Context, siteID string, severity string, limit, offset int) ([]AlertEvent, error) {
	if limit == 0 {
		limit = 50
	}
	query := `SELECT ae.id, ae.alert_id, a.name, m.name, a.severity, ae.triggered_at, ae.resolved_at, ae.acknowledged_by
		FROM alert_events ae
		JOIN alerts a ON ae.alert_id = a.id
		JOIN machines m ON a.machine_id = m.id
		JOIN production_lines pl ON m.line_id = pl.id
		WHERE pl.site_id = $1`
	args := []interface{}{siteID}
	argIdx := 2

	if severity != "" {
		query += ` AND a.severity = $` + itoa(argIdx)
		args = append(args, severity)
		argIdx++
	}

	query += ` ORDER BY ae.triggered_at DESC LIMIT $` + itoa(argIdx) + ` OFFSET $` + itoa(argIdx+1)
	args = append(args, limit, offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []AlertEvent
	for rows.Next() {
		var e AlertEvent
		if err := rows.Scan(&e.ID, &e.AlertID, &e.AlertName, &e.MachineName, &e.Severity, &e.TriggeredAt, &e.ResolvedAt, &e.AcknowledgedBy); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (s *Store) CreateAlert(ctx context.Context, name, machineID, metricName, condition string, threshold float64, severity string) (*Alert, error) {
	var a Alert
	err := s.db.QueryRow(ctx,
		`INSERT INTO alerts (name, machine_id, metric_name, condition, threshold, severity)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, machine_id, metric_name, condition, threshold, severity, is_active, created_at`,
		name, machineID, metricName, condition, threshold, severity,
	).Scan(&a.ID, &a.Name, &a.MachineID, &a.MetricName, &a.Condition, &a.Threshold, &a.Severity, &a.IsActive, &a.CreatedAt)
	return &a, err
}

func (s *Store) AcknowledgeAlertEvent(ctx context.Context, eventID, userID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE alert_events SET acknowledged_by = $1 WHERE id = $2`,
		userID, eventID)
	return err
}

func itoa(i int) string {
	return strconv.Itoa(i)
}
```

Add `"strconv"` to the import block.

- [ ] **Step 4: Create alert handler**

Create `internal/alert/handler.go`:

```go
package alert

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/industry-dashboard/server/internal/auth"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListAlerts(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id required", http.StatusBadRequest)
		return
	}
	alerts, err := h.store.ListAlerts(r.Context(), siteID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alerts)
}

func (h *Handler) ListAlertEvents(w http.ResponseWriter, r *http.Request) {
	siteID := r.URL.Query().Get("site_id")
	if siteID == "" {
		http.Error(w, "site_id required", http.StatusBadRequest)
		return
	}
	severity := r.URL.Query().Get("severity")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	events, err := h.store.ListAlertEvents(r.Context(), siteID, severity, limit, offset)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

func (h *Handler) CreateAlert(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name       string  `json:"name"`
		MachineID  string  `json:"machine_id"`
		MetricName string  `json:"metric_name"`
		Condition  string  `json:"condition"`
		Threshold  float64 `json:"threshold"`
		Severity   string  `json:"severity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Name == "" || body.MachineID == "" || body.MetricName == "" {
		http.Error(w, "name, machine_id, and metric_name are required", http.StatusBadRequest)
		return
	}
	alert, err := h.store.CreateAlert(r.Context(), body.Name, body.MachineID, body.MetricName, body.Condition, body.Threshold, body.Severity)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(alert)
}

func (h *Handler) AcknowledgeAlertEvent(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "eventID")
	claims := auth.GetClaims(r.Context())
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if err := h.store.AcknowledgeAlertEvent(r.Context(), eventID, claims.UserID); err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 5: Create user store**

Create `internal/user/store.go`:

```go
package user

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

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type UserWithRoles struct {
	User
	Roles []UserRole `json:"roles"`
}

type UserRole struct {
	ID       string  `json:"id"`
	RoleName string  `json:"role_name"`
	RoleID   string  `json:"role_id"`
	SiteID   *string `json:"site_id"`
	SiteName *string `json:"site_name"`
}

func (s *Store) ListUsers(ctx context.Context) ([]UserWithRoles, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, email, name, is_active, created_at FROM users ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []UserWithRoles
	for rows.Next() {
		var u UserWithRoles
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Fetch roles for all users
	for i := range users {
		roles, err := s.GetUserRoles(ctx, users[i].ID)
		if err != nil {
			return nil, err
		}
		users[i].Roles = roles
	}
	return users, nil
}

func (s *Store) GetUserRoles(ctx context.Context, userID string) ([]UserRole, error) {
	rows, err := s.db.Query(ctx,
		`SELECT usr.id, r.name, r.id, usr.site_id, s.name
		 FROM user_site_roles usr
		 JOIN roles r ON usr.role_id = r.id
		 LEFT JOIN sites s ON usr.site_id = s.id
		 WHERE usr.user_id = $1
		 ORDER BY r.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roles []UserRole
	for rows.Next() {
		var r UserRole
		if err := rows.Scan(&r.ID, &r.RoleName, &r.RoleID, &r.SiteID, &r.SiteName); err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	return roles, rows.Err()
}
```

- [ ] **Step 6: Create user handler**

Create `internal/user/handler.go`:

```go
package user

import (
	"encoding/json"
	"net/http"
)

type Handler struct {
	store *Store
}

func NewHandler(store *Store) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.store.ListUsers(r.Context())
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
```

- [ ] **Step 7: Create datapoint store**

Create `internal/datapoint/store.go`:

```go
package datapoint

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

type DataPoint struct {
	Time  time.Time `json:"time"`
	Value float64   `json:"value"`
}

type MachineMetrics struct {
	MachineID   string   `json:"machine_id"`
	MachineName string   `json:"machine_name"`
	Metrics     []string `json:"metrics"`
}

func (s *Store) GetTimeSeries(ctx context.Context, machineID, metricName, timeRange string) ([]DataPoint, error) {
	interval := "1 hour"
	switch timeRange {
	case "1h":
		interval = "1 minute"
	case "6h":
		interval = "5 minutes"
	case "24h":
		interval = "15 minutes"
	case "7d":
		interval = "1 hour"
	case "30d":
		interval = "6 hours"
	}

	rows, err := s.db.Query(ctx,
		`SELECT time_bucket($1::interval, time) AS bucket, AVG(value) AS avg_value
		 FROM data_points
		 WHERE machine_id = $2 AND metric_name = $3 AND time > NOW() - $4::interval
		 GROUP BY bucket
		 ORDER BY bucket`,
		interval, machineID, metricName, timeRange)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []DataPoint
	for rows.Next() {
		var p DataPoint
		if err := rows.Scan(&p.Time, &p.Value); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

func (s *Store) GetMachineMetrics(ctx context.Context, machineID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT metric_name FROM data_points WHERE machine_id = $1 ORDER BY metric_name`,
		machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var metrics []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, rows.Err()
}

func (s *Store) GetLatestValues(ctx context.Context, machineID string) (map[string]float64, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT ON (metric_name) metric_name, value
		 FROM data_points
		 WHERE machine_id = $1
		 ORDER BY metric_name, time DESC`,
		machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make(map[string]float64)
	for rows.Next() {
		var name string
		var value float64
		if err := rows.Scan(&name, &value); err != nil {
			return nil, err
		}
		values[name] = value
	}
	return values, rows.Err()
}
```

- [ ] **Step 8: Create datapoint handler**

Create `internal/datapoint/handler.go`:

```go
package datapoint

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

func (h *Handler) GetTimeSeries(w http.ResponseWriter, r *http.Request) {
	machineID := r.URL.Query().Get("machine_id")
	metric := r.URL.Query().Get("metric")
	timeRange := r.URL.Query().Get("range")
	if machineID == "" || metric == "" {
		http.Error(w, "machine_id and metric required", http.StatusBadRequest)
		return
	}
	if timeRange == "" {
		timeRange = "24h"
	}
	points, err := h.store.GetTimeSeries(r.Context(), machineID, metric, timeRange)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(points)
}

func (h *Handler) GetMachineMetrics(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	metrics, err := h.store.GetMachineMetrics(r.Context(), machineID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metrics)
}

func (h *Handler) GetLatestValues(w http.ResponseWriter, r *http.Request) {
	machineID := chi.URLParam(r, "machineID")
	values, err := h.store.GetLatestValues(r.Context(), machineID)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(values)
}
```

- [ ] **Step 9: Wire new routes in main.go**

Add to `cmd/server/main.go` — new imports and service initialization:

```go
import (
	// ... existing imports ...
	"github.com/industry-dashboard/server/internal/alert"
	"github.com/industry-dashboard/server/internal/user"
	"github.com/industry-dashboard/server/internal/datapoint"
)

// After existing service initialization:
alertStore := alert.NewStore(pool)
alertHandler := alert.NewHandler(alertStore)

userStore := user.NewStore(pool)
userHandler := user.NewHandler(userStore)

datapointStore := datapoint.NewStore(pool)
datapointHandler := datapoint.NewHandler(datapointStore)
```

Add new routes inside the protected `/api` route group:

```go
// Site detail + summary
r.Route("/{siteID}", func(r chi.Router) {
	r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/", siteHandler.GetSite)
	r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/summary", siteHandler.GetSiteSummary)
	r.With(rbacMW.Require("machine:view", rbac.SiteFromURLParam)).Get("/lines", siteHandler.ListLines)
})

// Alerts
r.Route("/alerts", func(r chi.Router) {
	r.With(rbacMW.Require("alert:view", rbac.SiteFromQuery)).Get("/", alertHandler.ListAlerts)
	r.With(rbacMW.Require("alert:create", rbac.SiteFromQuery), auditMW.Log("alert", "create")).Post("/", alertHandler.CreateAlert)
})
r.Route("/alert-events", func(r chi.Router) {
	r.With(rbacMW.Require("alert:view", rbac.SiteFromQuery)).Get("/", alertHandler.ListAlertEvents)
	r.With(rbacMW.Require("alert:acknowledge", rbac.SiteFromQuery), auditMW.Log("alert_event", "acknowledge")).Post("/{eventID}/acknowledge", alertHandler.AcknowledgeAlertEvent)
})

// Users (admin)
r.With(rbacMW.Require("user:manage", rbac.SiteFromQuery)).Get("/users", userHandler.ListUsers)

// Data points
r.Get("/datapoints", datapointHandler.GetTimeSeries)
r.Route("/machines/{machineID}", func(r chi.Router) {
	r.Get("/metrics", datapointHandler.GetMachineMetrics)
	r.Get("/latest", datapointHandler.GetLatestValues)
})
```

- [ ] **Step 10: Verify compilation**

```bash
go build ./...
```

- [ ] **Step 11: Commit**

```bash
git add internal/alert/ internal/user/ internal/datapoint/ internal/site/ cmd/server/main.go
git commit -m "feat: add alert, user, datapoint endpoints and site summary"
```

---

### Task 5: Reusable Chart Components

**Files:**
- Create: `frontend/src/components/charts/LineChart.tsx`
- Create: `frontend/src/components/charts/BarChart.tsx`
- Create: `frontend/src/components/charts/PieChart.tsx`

- [ ] **Step 1: Create LineChart component**

Create `frontend/src/components/charts/LineChart.tsx`:

```tsx
import { ResponsiveContainer, LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props {
  data: { time: string; value: number }[];
  color?: string;
  yLabel?: string;
}

export function LineChart({ data, color = '#3b82f6', yLabel }: Props) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <RechartsLineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="time"
          tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          fontSize={11}
          stroke="#94a3b8"
        />
        <YAxis fontSize={11} stroke="#94a3b8" label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 } : undefined} />
        <Tooltip
          labelFormatter={(v) => new Date(v).toLocaleString()}
          contentStyle={{ fontSize: 12 }}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </RechartsLineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create BarChart component**

Create `frontend/src/components/charts/BarChart.tsx`:

```tsx
import { ResponsiveContainer, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface Props {
  data: { name: string; value: number }[];
  color?: string;
}

export function BarChart({ data, color = '#3b82f6' }: Props) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <RechartsBarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" fontSize={11} stroke="#94a3b8" />
        <YAxis fontSize={11} stroke="#94a3b8" />
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Create PieChart component**

Create `frontend/src/components/charts/PieChart.tsx`:

```tsx
import { ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface Props {
  data: { name: string; value: number }[];
}

export function PieChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <RechartsPieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={11}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ fontSize: 12 }} />
        <Legend fontSize={11} />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/charts/
git commit -m "feat: add reusable LineChart, BarChart, PieChart components"
```

---

### Task 6: Site Overview Page (Real Data)

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Rewrite DashboardPage with real data**

Replace `frontend/src/pages/DashboardPage.tsx`:

```tsx
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSite } from '@/lib/site-context';
import { useSiteSummary, useSiteLines, useAlertEvents } from '@/lib/hooks';

export function DashboardPage() {
  const { currentSite } = useSite();
  const { data: summary } = useSiteSummary(currentSite?.id);
  const { data: lines } = useSiteLines(currentSite?.id);
  const { data: alertEvents } = useAlertEvents(currentSite?.id, { limit: '5' });

  if (!currentSite) {
    return <div className="text-slate-500">Select a site to view the dashboard.</div>;
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">{currentSite.name} — Overview</h2>

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Machines Online</p>
          <p className="text-2xl font-bold text-green-600">
            {summary ? `${summary.online_machines}/${summary.total_machines}` : '--'}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Production Lines</p>
          <p className="text-2xl font-bold text-blue-600">{summary?.total_lines ?? '--'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Active Alerts</p>
          <p className="text-2xl font-bold text-red-600">{summary?.active_alerts ?? '--'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Site</p>
          <p className="text-lg font-semibold">{currentSite.code}</p>
          <p className="text-xs text-slate-400">{currentSite.timezone}</p>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Production Lines */}
        <Card className="col-span-2 p-4">
          <h3 className="mb-3 font-semibold">Production Lines</h3>
          {lines && lines.length > 0 ? (
            <div className="space-y-2">
              {lines.map((line: any) => (
                <div key={line.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium">{line.name}</span>
                  <Badge variant="outline">Order: {line.display_order}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No production lines configured.</p>
          )}
        </Card>

        {/* Recent Alerts */}
        <Card className="p-4">
          <h3 className="mb-3 font-semibold">Recent Alerts</h3>
          {alertEvents && alertEvents.length > 0 ? (
            <div className="space-y-2">
              {alertEvents.map((event: any) => (
                <div key={event.id} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={event.severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
                      {event.severity}
                    </Badge>
                    <span className="font-medium">{event.machine_name}</span>
                  </div>
                  <p className="mt-1 text-slate-500">{event.alert_name}</p>
                  <p className="text-slate-400">{new Date(event.triggered_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No recent alerts.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: site overview page with KPI cards, production lines, recent alerts"
```

---

### Task 7: Machine List & Detail Pages

**Files:**
- Create: `frontend/src/pages/MachineListPage.tsx`
- Create: `frontend/src/pages/MachineDetailPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create MachineListPage**

Create `frontend/src/pages/MachineListPage.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSite } from '@/lib/site-context';
import { useSiteLines, useLineMachines } from '@/lib/hooks';

function MachinesForLine({ lineId }: { lineId: string }) {
  const { data: machines, isLoading } = useLineMachines(lineId);
  if (isLoading) return <p className="p-2 text-sm text-slate-400">Loading...</p>;
  if (!machines || machines.length === 0) return <p className="p-2 text-sm text-slate-400">No machines.</p>;

  const statusColor: Record<string, string> = {
    running: 'bg-green-500',
    offline: 'bg-slate-400',
    error: 'bg-red-500',
    maintenance: 'bg-yellow-500',
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Machine</TableHead>
          <TableHead>Model</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {machines.map((m: any) => (
          <TableRow key={m.id}>
            <TableCell className="font-medium">{m.name}</TableCell>
            <TableCell className="text-slate-500">{m.model ?? '—'}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${statusColor[m.status] ?? 'bg-slate-300'}`} />
                <span className="text-sm capitalize">{m.status}</span>
              </div>
            </TableCell>
            <TableCell>
              <Link to={`/machines/${m.id}`} className="text-sm text-blue-500 hover:underline">
                Details
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function MachineListPage() {
  const { currentSite } = useSite();
  const { data: lines } = useSiteLines(currentSite?.id);

  if (!currentSite) return <div className="text-slate-500">Select a site.</div>;

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Machines — {currentSite.name}</h2>
      {lines && lines.length > 0 ? (
        <div className="space-y-4">
          {lines.map((line: any) => (
            <Card key={line.id} className="p-4">
              <h3 className="mb-2 font-semibold">{line.name}</h3>
              <MachinesForLine lineId={line.id} />
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-slate-400">No production lines.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create MachineDetailPage**

Create `frontend/src/pages/MachineDetailPage.tsx`:

```tsx
import { useParams } from 'react-router-dom';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart } from '@/components/charts/LineChart';
import { useDataPoints } from '@/lib/hooks';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function MachineDetailPage() {
  const { machineId } = useParams<{ machineId: string }>();
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [timeRange, setTimeRange] = useState('24h');

  const { data: metrics } = useQuery({
    queryKey: ['machine-metrics', machineId],
    queryFn: async () => {
      const res = await apiFetch(`/machines/${machineId}/metrics`);
      return res.ok ? res.json() : [];
    },
    enabled: !!machineId,
  });

  const { data: latest } = useQuery({
    queryKey: ['machine-latest', machineId],
    queryFn: async () => {
      const res = await apiFetch(`/machines/${machineId}/latest`);
      return res.ok ? res.json() : {};
    },
    enabled: !!machineId,
    refetchInterval: 30000,
  });

  const { data: timeSeries } = useDataPoints(machineId, selectedMetric, timeRange);

  // Auto-select first metric
  if (metrics && metrics.length > 0 && !selectedMetric) {
    setSelectedMetric(metrics[0]);
  }

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Machine Detail</h2>

      {/* Latest values */}
      <div className="mb-6 grid grid-cols-4 gap-3">
        {latest && Object.entries(latest).map(([key, value]) => (
          <Card key={key} className="p-3">
            <p className="text-xs text-slate-500">{key}</p>
            <p className="text-lg font-bold">{(value as number).toFixed(2)}</p>
          </Card>
        ))}
        {latest && Object.keys(latest).length === 0 && (
          <p className="col-span-4 text-sm text-slate-400">No data points yet.</p>
        )}
      </div>

      {/* Time series chart */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="font-semibold">Metrics</h3>
          {metrics && metrics.length > 0 && (
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                {metrics.map((m: string) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">1 Hour</SelectItem>
              <SelectItem value="6h">6 Hours</SelectItem>
              <SelectItem value="24h">24 Hours</SelectItem>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {timeSeries && timeSeries.length > 0 ? (
          <LineChart data={timeSeries} yLabel={selectedMetric} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400">
            {selectedMetric ? 'No data for this time range.' : 'Select a metric to view chart.'}
          </p>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Add routes in App.tsx**

Update `frontend/src/App.tsx` — add imports and routes:

```tsx
import { MachineListPage } from '@/pages/MachineListPage';
import { MachineDetailPage } from '@/pages/MachineDetailPage';

// Replace placeholder routes:
<Route path="/machines" element={<MachineListPage />} />
<Route path="/machines/:machineId" element={<MachineDetailPage />} />
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/MachineListPage.tsx frontend/src/pages/MachineDetailPage.tsx frontend/src/App.tsx
git commit -m "feat: add machine list and machine detail pages with metrics chart"
```

---

### Task 8: Alerts Page

**Files:**
- Create: `frontend/src/pages/AlertsPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create AlertsPage**

Create `frontend/src/pages/AlertsPage.tsx`:

```tsx
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSite } from '@/lib/site-context';
import { useAlertEvents, useAcknowledgeAlert } from '@/lib/hooks';

export function AlertsPage() {
  const { currentSite } = useSite();
  const [severity, setSeverity] = useState('');
  const params: Record<string, string> = { limit: '50' };
  if (severity) params.severity = severity;

  const { data: events, isLoading } = useAlertEvents(currentSite?.id, params);
  const acknowledge = useAcknowledgeAlert();

  if (!currentSite) return <div className="text-slate-500">Select a site.</div>;

  const severityBadge = (s: string) => {
    switch (s) {
      case 'critical': return <Badge variant="destructive">{s}</Badge>;
      case 'warning': return <Badge className="bg-yellow-100 text-yellow-800">{s}</Badge>;
      default: return <Badge variant="secondary">{s}</Badge>;
    }
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Alerts — {currentSite.name}</h2>

      <div className="mb-4 flex items-center gap-3">
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Severity</TableHead>
              <TableHead>Alert</TableHead>
              <TableHead>Machine</TableHead>
              <TableHead>Triggered</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-slate-400">Loading...</TableCell></TableRow>
            )}
            {events && events.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-slate-400">No alerts.</TableCell></TableRow>
            )}
            {events?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell>{severityBadge(e.severity)}</TableCell>
                <TableCell className="font-medium">{e.alert_name}</TableCell>
                <TableCell>{e.machine_name}</TableCell>
                <TableCell className="text-sm text-slate-500">{new Date(e.triggered_at).toLocaleString()}</TableCell>
                <TableCell>
                  {e.resolved_at ? (
                    <Badge variant="outline" className="text-green-600">Resolved</Badge>
                  ) : e.acknowledged_by ? (
                    <Badge variant="outline" className="text-blue-600">Acknowledged</Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600">Open</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!e.resolved_at && !e.acknowledged_by && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => acknowledge.mutate(e.id)}
                      disabled={acknowledge.isPending}
                    >
                      Acknowledge
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.tsx**

```tsx
import { AlertsPage } from '@/pages/AlertsPage';
// Replace: <Route path="/alerts" element={<div>...</div>} />
<Route path="/alerts" element={<AlertsPage />} />
```

- [ ] **Step 3: Verify build and commit**

```bash
cd frontend && npm run build
git add frontend/src/pages/AlertsPage.tsx frontend/src/App.tsx
git commit -m "feat: add alerts page with severity filter and acknowledge action"
```

---

### Task 9: RBAC Admin — Users Page

**Files:**
- Create: `frontend/src/pages/admin/UsersPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create UsersPage**

Create `frontend/src/pages/admin/UsersPage.tsx`:

```tsx
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useUsers, useRoles, useAssignRole, useRemoveRoleAssignment } from '@/lib/hooks';
import { useSite } from '@/lib/site-context';

export function UsersPage() {
  const { data: users, isLoading } = useUsers();
  const { data: roles } = useRoles();
  const { sites } = useSite();
  const assignRole = useAssignRole();
  const removeRole = useRemoveRoleAssignment();

  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedSite, setSelectedSite] = useState('');

  const handleAssign = () => {
    if (!selectedUser || !selectedRole) return;
    assignRole.mutate({
      user_id: selectedUser,
      role_id: selectedRole,
      site_id: selectedSite || undefined,
    });
    setSelectedRole('');
    setSelectedSite('');
  };

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">User Management</h2>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">Loading...</TableCell></TableRow>
            )}
            {users?.map((u: any) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-slate-500">{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? 'default' : 'secondary'}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.roles?.map((r: any) => (
                      <Badge key={r.id} variant="outline" className="gap-1">
                        {r.role_name}{r.site_name ? ` @ ${r.site_name}` : ' (global)'}
                        <button
                          onClick={() => removeRole.mutate(r.id)}
                          className="ml-1 text-red-400 hover:text-red-600"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                    {(!u.roles || u.roles.length === 0) && (
                      <span className="text-xs text-slate-400">No roles</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" onClick={() => setSelectedUser(u.id)}>
                        Assign Role
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign Role to {u.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                          <SelectContent>
                            {roles?.map((r: any) => (
                              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={selectedSite} onValueChange={setSelectedSite}>
                          <SelectTrigger><SelectValue placeholder="Global (all sites)" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">Global</SelectItem>
                            {sites.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleAssign} disabled={!selectedRole}>
                          Assign
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add route**

```tsx
import { UsersPage } from '@/pages/admin/UsersPage';
<Route path="/admin/users" element={<UsersPage />} />
```

- [ ] **Step 3: Verify build and commit**

```bash
cd frontend && npm run build
git add frontend/src/pages/admin/UsersPage.tsx frontend/src/App.tsx
git commit -m "feat: add user management page with role assignment dialog"
```

---

### Task 10: RBAC Admin — Roles Page

**Files:**
- Create: `frontend/src/pages/admin/RolesPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create RolesPage**

Create `frontend/src/pages/admin/RolesPage.tsx`:

```tsx
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useRoles, usePermissions, useRolePermissions, useCreateRole } from '@/lib/hooks';

function RoleDetail({ roleId }: { roleId: string }) {
  const { data: perms } = useRolePermissions(roleId);
  if (!perms) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {perms.map((p: any) => (
        <Badge key={p.id} variant="outline" className="text-xs">{p.code}</Badge>
      ))}
    </div>
  );
}

export function RolesPage() {
  const { data: roles } = useRoles();
  const { data: permissions } = usePermissions();
  const createRole = useCreateRole();
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!newName) return;
    await createRole.mutateAsync({ name: newName, description: newDesc, permission_ids: selectedPerms });
    setNewName('');
    setNewDesc('');
    setSelectedPerms([]);
  };

  const togglePerm = (id: string) => {
    setSelectedPerms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Group permissions by group_name
  const permGroups = permissions?.reduce((acc: Record<string, any[]>, p: any) => {
    (acc[p.group_name] = acc[p.group_name] || []).push(p);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Role Management</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button>Create Role</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Role name" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <Input placeholder="Description" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              <div className="max-h-64 overflow-y-auto">
                {permGroups && Object.entries(permGroups).map(([group, perms]) => (
                  <div key={group} className="mb-3">
                    <p className="mb-1 text-xs font-semibold uppercase text-slate-400">{group}</p>
                    {(perms as any[]).map((p: any) => (
                      <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm">
                        <Checkbox
                          checked={selectedPerms.includes(p.id)}
                          onCheckedChange={() => togglePerm(p.id)}
                        />
                        <span>{p.code}</span>
                        <span className="text-xs text-slate-400">— {p.description}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <Button onClick={handleCreate} disabled={!newName || createRole.isPending}>
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {roles?.map((r: any) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold">{r.name}</span>
                {r.is_system && <Badge variant="secondary" className="ml-2 text-xs">System</Badge>}
                <p className="text-sm text-slate-500">{r.description}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setExpandedRole(expandedRole === r.id ? null : r.id)}
              >
                {expandedRole === r.id ? 'Hide' : 'Show'} Permissions
              </Button>
            </div>
            {expandedRole === r.id && (
              <div className="mt-3 border-t pt-3">
                <RoleDetail roleId={r.id} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route and verify**

```tsx
import { RolesPage } from '@/pages/admin/RolesPage';
<Route path="/admin/roles" element={<RolesPage />} />
```

```bash
cd frontend && npm run build
git add frontend/src/pages/admin/RolesPage.tsx frontend/src/App.tsx
git commit -m "feat: add role management page with create dialog and permission editor"
```

---

### Task 11: Audit Log Viewer

**Files:**
- Create: `frontend/src/pages/admin/AuditLogPage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create AuditLogPage**

Create `frontend/src/pages/admin/AuditLogPage.tsx`:

```tsx
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useAuditLogs } from '@/lib/hooks';

export function AuditLogPage() {
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  const params: Record<string, string> = {
    limit: String(limit),
    offset: String(page * limit),
  };
  if (action) params.action = action;
  if (resourceType) params.resource_type = resourceType;

  const { data: logs, isLoading } = useAuditLogs(params);

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Audit Log</h2>

      <div className="mb-4 flex items-center gap-3">
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="assign">Assign</SelectItem>
            <SelectItem value="remove">Remove</SelectItem>
            <SelectItem value="acknowledge">Acknowledge</SelectItem>
          </SelectContent>
        </Select>
        <Select value={resourceType} onValueChange={setResourceType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All</SelectItem>
            <SelectItem value="site">Site</SelectItem>
            <SelectItem value="role">Role</SelectItem>
            <SelectItem value="user_site_role">Role Assignment</SelectItem>
            <SelectItem value="alert">Alert</SelectItem>
            <SelectItem value="alert_event">Alert Event</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">Loading...</TableCell></TableRow>
            )}
            {logs && logs.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400">No audit logs.</TableCell></TableRow>
            )}
            {logs?.map((log: any) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm text-slate-500">
                  {new Date(log.timestamp).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{log.user_id?.slice(0, 8) ?? '—'}</TableCell>
                <TableCell className="font-medium">{log.action}</TableCell>
                <TableCell className="text-sm">
                  {log.resource_type}
                  {log.resource_id && <span className="text-slate-400"> #{log.resource_id.slice(0, 8)}</span>}
                </TableCell>
                <TableCell className="text-sm text-slate-400">{log.ip_address ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-3 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
          Previous
        </Button>
        <span className="text-sm text-slate-500">Page {page + 1}</span>
        <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={!logs || logs.length < limit}>
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route, verify build, commit**

```tsx
import { AuditLogPage } from '@/pages/admin/AuditLogPage';
<Route path="/admin/audit" element={<AuditLogPage />} />
```

```bash
cd frontend && npm run build
git add frontend/src/pages/admin/AuditLogPage.tsx frontend/src/App.tsx
git commit -m "feat: add audit log viewer with action and resource filters"
```

---

### Task 12: Update CLAUDE.md & Final Verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md backend structure**

Add the new packages to the Architecture section:

```
internal/
  alert/                   # Alert CRUD and alert events
  user/                    # User listing with role details
  datapoint/               # Time-series data queries, aggregations
```

- [ ] **Step 2: Run all Go tests**

```bash
go test ./... -v
```

- [ ] **Step 3: Verify frontend build**

```bash
cd frontend && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: update CLAUDE.md with new backend packages"
```
