package site

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

type Site struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Code      string    `json:"code"`
	Timezone  string    `json:"timezone"`
	Address   *string   `json:"address"`
	CreatedAt time.Time `json:"created_at"`
}

type ProductionLine struct {
	ID           string    `json:"id"`
	SiteID       string    `json:"site_id"`
	Name         string    `json:"name"`
	DisplayOrder int       `json:"display_order"`
	CreatedAt    time.Time `json:"created_at"`
}

type Machine struct {
	ID        string                 `json:"id"`
	LineID    string                 `json:"line_id"`
	Name      string                 `json:"name"`
	Model     *string                `json:"model"`
	Status    string                 `json:"status"`
	Config    map[string]interface{} `json:"modbus_config"`
	CreatedAt time.Time              `json:"created_at"`
}

func (s *Store) ListSites(ctx context.Context) ([]Site, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name, code, timezone, address, created_at FROM sites ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sites []Site
	for rows.Next() {
		var site Site
		if err := rows.Scan(&site.ID, &site.Name, &site.Code, &site.Timezone, &site.Address, &site.CreatedAt); err != nil {
			return nil, err
		}
		sites = append(sites, site)
	}
	return sites, nil
}

func (s *Store) CreateSite(ctx context.Context, name, code, timezone, address string) (*Site, error) {
	var site Site
	var addr *string
	if address != "" {
		addr = &address
	}
	err := s.db.QueryRow(ctx,
		`INSERT INTO sites (name, code, timezone, address) VALUES ($1, $2, $3, $4)
		 RETURNING id, name, code, timezone, address, created_at`,
		name, code, timezone, addr,
	).Scan(&site.ID, &site.Name, &site.Code, &site.Timezone, &site.Address, &site.CreatedAt)
	return &site, err
}

func (s *Store) ListLinesBySite(ctx context.Context, siteID string) ([]ProductionLine, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, site_id, name, display_order, created_at FROM production_lines WHERE site_id = $1 ORDER BY display_order`,
		siteID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []ProductionLine
	for rows.Next() {
		var line ProductionLine
		if err := rows.Scan(&line.ID, &line.SiteID, &line.Name, &line.DisplayOrder, &line.CreatedAt); err != nil {
			return nil, err
		}
		lines = append(lines, line)
	}
	return lines, nil
}

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

func (s *Store) ListMachinesByLine(ctx context.Context, lineID string) ([]Machine, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, line_id, name, model, status, modbus_config, created_at FROM machines WHERE line_id = $1 ORDER BY name`,
		lineID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var machines []Machine
	for rows.Next() {
		var m Machine
		var configBytes []byte
		if err := rows.Scan(&m.ID, &m.LineID, &m.Name, &m.Model, &m.Status, &configBytes, &m.CreatedAt); err != nil {
			return nil, err
		}
		if configBytes != nil {
			json.Unmarshal(configBytes, &m.Config)
		}
		machines = append(machines, m)
	}
	return machines, nil
}

func (s *Store) UpdateSite(ctx context.Context, id, name, timezone, address string) (*Site, error) {
	var site Site
	var addr *string
	if address != "" {
		addr = &address
	}
	err := s.db.QueryRow(ctx,
		`UPDATE sites SET name=$1, timezone=$2, address=$3, updated_at=NOW() WHERE id=$4
		 RETURNING id, name, code, timezone, address, created_at`,
		name, timezone, addr, id,
	).Scan(&site.ID, &site.Name, &site.Code, &site.Timezone, &site.Address, &site.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &site, nil
}

func (s *Store) DeleteSite(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM sites WHERE id=$1`, id)
	return err
}

func (s *Store) CreateLine(ctx context.Context, siteID, name string, displayOrder int) (*ProductionLine, error) {
	var line ProductionLine
	err := s.db.QueryRow(ctx,
		`INSERT INTO production_lines (site_id, name, display_order) VALUES ($1, $2, $3)
		 RETURNING id, site_id, name, display_order, created_at`,
		siteID, name, displayOrder,
	).Scan(&line.ID, &line.SiteID, &line.Name, &line.DisplayOrder, &line.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &line, nil
}

func (s *Store) UpdateLine(ctx context.Context, id, name string, displayOrder int) (*ProductionLine, error) {
	var line ProductionLine
	err := s.db.QueryRow(ctx,
		`UPDATE production_lines SET name=$1, display_order=$2, updated_at=NOW() WHERE id=$3
		 RETURNING id, site_id, name, display_order, created_at`,
		name, displayOrder, id,
	).Scan(&line.ID, &line.SiteID, &line.Name, &line.DisplayOrder, &line.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &line, nil
}

func (s *Store) DeleteLine(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM production_lines WHERE id=$1`, id)
	return err
}

func (s *Store) CreateMachine(ctx context.Context, lineID, name, model string) (*Machine, error) {
	var m Machine
	var mod *string
	if model != "" {
		mod = &model
	}
	err := s.db.QueryRow(ctx,
		`INSERT INTO machines (line_id, name, model, status) VALUES ($1, $2, $3, 'offline')
		 RETURNING id, line_id, name, model, status, created_at`,
		lineID, name, mod,
	).Scan(&m.ID, &m.LineID, &m.Name, &m.Model, &m.Status, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Store) UpdateMachine(ctx context.Context, id, name, model string) (*Machine, error) {
	var m Machine
	var mod *string
	if model != "" {
		mod = &model
	}
	err := s.db.QueryRow(ctx,
		`UPDATE machines SET name=$1, model=$2, updated_at=NOW() WHERE id=$3
		 RETURNING id, line_id, name, model, status, created_at`,
		name, mod, id,
	).Scan(&m.ID, &m.LineID, &m.Name, &m.Model, &m.Status, &m.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

func (s *Store) DeleteMachine(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM machines WHERE id=$1`, id)
	return err
}

type SiteWithCounts struct {
	Site
	LineCount    int `json:"line_count"`
	MachineCount int `json:"machine_count"`
}

func (s *Store) ListAllSites(ctx context.Context) ([]SiteWithCounts, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			s.id, s.name, s.code, s.timezone, s.address, s.created_at,
			(SELECT COUNT(*) FROM production_lines pl WHERE pl.site_id = s.id) AS line_count,
			(SELECT COUNT(*) FROM machines m JOIN production_lines pl ON m.line_id = pl.id WHERE pl.site_id = s.id) AS machine_count
		FROM sites s
		ORDER BY s.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	sites := []SiteWithCounts{}
	for rows.Next() {
		var sc SiteWithCounts
		if err := rows.Scan(&sc.ID, &sc.Name, &sc.Code, &sc.Timezone, &sc.Address, &sc.CreatedAt, &sc.LineCount, &sc.MachineCount); err != nil {
			return nil, err
		}
		sites = append(sites, sc)
	}
	return sites, nil
}

type SiteDetailMachine struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Model      *string `json:"model"`
	Status     string  `json:"status"`
	WorkerName *string `json:"worker_name"`
	WorkerID   *string `json:"worker_id"`
}

type SiteDetailLine struct {
	ID           string              `json:"id"`
	Name         string              `json:"name"`
	DisplayOrder int                 `json:"display_order"`
	Machines     []SiteDetailMachine `json:"machines"`
}

type SiteDetail struct {
	Site  Site             `json:"site"`
	Lines []SiteDetailLine `json:"lines"`
}

func (s *Store) GetSiteDetail(ctx context.Context, siteID string) (*SiteDetail, error) {
	site, err := s.GetSite(ctx, siteID)
	if err != nil {
		return nil, err
	}

	lines, err := s.ListLinesBySite(ctx, siteID)
	if err != nil {
		return nil, err
	}

	detail := &SiteDetail{
		Site:  *site,
		Lines: []SiteDetailLine{},
	}

	for _, line := range lines {
		dl := SiteDetailLine{
			ID:           line.ID,
			Name:         line.Name,
			DisplayOrder: line.DisplayOrder,
			Machines:     []SiteDetailMachine{},
		}

		rows, err := s.db.Query(ctx, `
			SELECT m.id, m.name, m.model, m.status, w.name, w.id::text
			FROM machines m
			LEFT JOIN machine_workers mw ON mw.machine_id = m.id
			LEFT JOIN workers w ON w.id = mw.worker_ref_id
			WHERE m.line_id = $1
			ORDER BY m.name
		`, line.ID)
		if err != nil {
			return nil, err
		}

		for rows.Next() {
			var dm SiteDetailMachine
			if err := rows.Scan(&dm.ID, &dm.Name, &dm.Model, &dm.Status, &dm.WorkerName, &dm.WorkerID); err != nil {
				rows.Close()
				return nil, err
			}
			dl.Machines = append(dl.Machines, dm)
		}
		rows.Close()

		detail.Lines = append(detail.Lines, dl)
	}

	return detail, nil
}
