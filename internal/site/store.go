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
