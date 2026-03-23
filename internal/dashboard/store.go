package dashboard

import (
	"context"
	"encoding/json"
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
