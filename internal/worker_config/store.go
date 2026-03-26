package worker_config

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

// ConfigSummary is returned by ListConfigs.
type ConfigSummary struct {
	ID            string    `json:"id"`
	Name          string    `json:"name"`
	SiteID        string    `json:"site_id"`
	SiteName      string    `json:"site_name"`
	MachineCount  int       `json:"machine_count"`
	PollInterval  string    `json:"poll_interval"`
	WorkerStatus  string    `json:"worker_status"`
	CreatedAt     time.Time `json:"created_at"`
}

// ConfigMachine is a machine entry inside a config detail.
type ConfigMachine struct {
	ID            string `json:"id"`
	MachineID     string `json:"machine_id"`
	MachineName   string `json:"machine_name"`
	Model         string `json:"model"`
	LineName      string `json:"line_name"`
	Host          string `json:"host"`
	Port          int    `json:"port"`
	SlaveID       int    `json:"slave_id"`
	RegisterCount int    `json:"register_count"`
}

// ConfigDetail is returned by GetConfig.
type ConfigDetail struct {
	ID           string          `json:"id"`
	Name         string          `json:"name"`
	SiteID       string          `json:"site_id"`
	SiteName     string          `json:"site_name"`
	SiteCode     string          `json:"site_code"`
	PollInterval string          `json:"poll_interval"`
	Machines     []ConfigMachine `json:"machines"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

// ConfigMachineInput is used to set machines on a config.
type ConfigMachineInput struct {
	MachineID string `json:"machine_id"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	SlaveID   int    `json:"slave_id"`
}

func (s *Store) ListConfigs(ctx context.Context) ([]ConfigSummary, error) {
	rows, err := s.db.Query(ctx, `
		SELECT
			wc.id,
			wc.name,
			wc.site_id,
			si.name AS site_name,
			COUNT(wcm.id) AS machine_count,
			wc.poll_interval,
			COALESCE(w.status, 'not_deployed') AS worker_status,
			wc.created_at
		FROM worker_configs wc
		JOIN sites si ON si.id = wc.site_id
		LEFT JOIN worker_config_machines wcm ON wcm.config_id = wc.id
		LEFT JOIN workers w ON w.name = wc.name
		GROUP BY wc.id, si.name, w.status
		ORDER BY wc.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	configs := []ConfigSummary{}
	for rows.Next() {
		var c ConfigSummary
		if err := rows.Scan(&c.ID, &c.Name, &c.SiteID, &c.SiteName, &c.MachineCount, &c.PollInterval, &c.WorkerStatus, &c.CreatedAt); err != nil {
			return nil, err
		}
		configs = append(configs, c)
	}
	return configs, nil
}

func (s *Store) CreateConfig(ctx context.Context, name, siteID, pollInterval string) (*ConfigDetail, error) {
	var c ConfigDetail
	err := s.db.QueryRow(ctx, `
		INSERT INTO worker_configs (name, site_id, poll_interval)
		VALUES ($1, $2, $3)
		RETURNING id, name, site_id, poll_interval, created_at, updated_at
	`, name, siteID, pollInterval).Scan(&c.ID, &c.Name, &c.SiteID, &c.PollInterval, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	c.Machines = []ConfigMachine{}
	return &c, nil
}

func (s *Store) GetConfig(ctx context.Context, id string) (*ConfigDetail, error) {
	var c ConfigDetail
	err := s.db.QueryRow(ctx, `
		SELECT wc.id, wc.name, wc.site_id, si.name, si.code, wc.poll_interval, wc.created_at, wc.updated_at
		FROM worker_configs wc
		JOIN sites si ON si.id = wc.site_id
		WHERE wc.id = $1
	`, id).Scan(&c.ID, &c.Name, &c.SiteID, &c.SiteName, &c.SiteCode, &c.PollInterval, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT
			wcm.id,
			m.id AS machine_id,
			m.name AS machine_name,
			COALESCE(m.model, '') AS model,
			pl.name AS line_name,
			wcm.host,
			wcm.port,
			wcm.slave_id,
			jsonb_array_length(COALESCE(m.modbus_config->'registers', '[]'::jsonb)) AS register_count
		FROM worker_config_machines wcm
		JOIN machines m ON m.id = wcm.machine_id
		JOIN production_lines pl ON pl.id = m.line_id
		WHERE wcm.config_id = $1
		ORDER BY pl.name, m.name
	`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	c.Machines = []ConfigMachine{}
	for rows.Next() {
		var m ConfigMachine
		if err := rows.Scan(&m.ID, &m.MachineID, &m.MachineName, &m.Model, &m.LineName, &m.Host, &m.Port, &m.SlaveID, &m.RegisterCount); err != nil {
			return nil, err
		}
		c.Machines = append(c.Machines, m)
	}
	return &c, nil
}

func (s *Store) UpdateConfig(ctx context.Context, id, name, siteID, pollInterval string) (*ConfigDetail, error) {
	var c ConfigDetail
	err := s.db.QueryRow(ctx, `
		UPDATE worker_configs
		SET name=$1, site_id=$2, poll_interval=$3, updated_at=NOW()
		WHERE id=$4
		RETURNING id, name, site_id, poll_interval, created_at, updated_at
	`, name, siteID, pollInterval, id).Scan(&c.ID, &c.Name, &c.SiteID, &c.PollInterval, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	c.Machines = []ConfigMachine{}
	return &c, nil
}

func (s *Store) DeleteConfig(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM worker_configs WHERE id=$1`, id)
	return err
}

func (s *Store) SetConfigMachines(ctx context.Context, configID string, machines []ConfigMachineInput) error {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `DELETE FROM worker_config_machines WHERE config_id=$1`, configID)
	if err != nil {
		return err
	}

	for _, m := range machines {
		port := m.Port
		if port == 0 {
			port = 502
		}
		slaveID := m.SlaveID
		if slaveID == 0 {
			slaveID = 1
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO worker_config_machines (config_id, machine_id, host, port, slave_id)
			VALUES ($1, $2, $3, $4, $5)
		`, configID, m.MachineID, m.Host, port, slaveID)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}
