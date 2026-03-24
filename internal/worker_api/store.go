package worker_api

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrWorkerNotFound = errors.New("worker not found")
	ErrWorkerOffline  = errors.New("worker is offline")
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

// Worker represents a registered worker process.
type Worker struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Status       string     `json:"status"`
	Hostname     *string    `json:"hostname"`
	IPAddress    *string    `json:"ip_address"`
	PID          *int       `json:"pid"`
	Version      *string    `json:"version"`
	ConfigPath   *string    `json:"config_path"`
	OSInfo       *string    `json:"os_info"`
	MachineCount int        `json:"machine_count"`
	StartedAt    *time.Time `json:"started_at"`
	HeartbeatAt  time.Time  `json:"heartbeat_at"`
}

// WorkerDetail embeds Worker and adds related machine and command data.
type WorkerDetail struct {
	Worker
	Machines        []WorkerMachine  `json:"machines"`
	RecentCommands  []CommandSummary `json:"recent_commands"`
}

// WorkerMachine is a machine associated with a worker.
type WorkerMachine struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Status   string `json:"status"`
	LineName string `json:"line_name"`
}

// Command represents a command sent to a worker.
type Command struct {
	ID          string     `json:"id"`
	WorkerID    string     `json:"worker_id"`
	Command     string     `json:"command"`
	Status      string     `json:"status"`
	Result      *string    `json:"result"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

// CommandSummary is like Command but without WorkerID (used in worker detail context).
type CommandSummary struct {
	ID          string     `json:"id"`
	Command     string     `json:"command"`
	Status      string     `json:"status"`
	Result      *string    `json:"result"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

// ListWorkers marks stale workers offline then returns all workers with machine counts.
func (s *Store) ListWorkers(ctx context.Context) ([]Worker, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// Mark stale workers offline and release their machines.
	_, err = tx.Exec(ctx, `
		WITH stale AS (
			UPDATE workers SET status = 'offline', updated_at = NOW()
			WHERE status != 'offline' AND heartbeat_at < NOW() - INTERVAL '90 seconds'
			RETURNING id
		),
		released AS (
			DELETE FROM machine_workers
			WHERE worker_ref_id IN (SELECT id FROM stale)
			RETURNING machine_id
		)
		UPDATE machines SET status = 'offline', updated_at = NOW()
		WHERE id IN (SELECT machine_id FROM released)
	`)
	if err != nil {
		return nil, err
	}

	rows, err := tx.Query(ctx, `
		SELECT
			w.id,
			w.name,
			w.status,
			w.hostname,
			w.ip_address,
			w.pid,
			w.version,
			w.config_path,
			w.os_info,
			COUNT(mw.machine_id) AS machine_count,
			w.started_at,
			w.heartbeat_at
		FROM workers w
		LEFT JOIN machine_workers mw ON mw.worker_ref_id = w.id
		GROUP BY w.id
		ORDER BY w.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	workers := []Worker{}
	for rows.Next() {
		var w Worker
		if err := rows.Scan(
			&w.ID, &w.Name, &w.Status,
			&w.Hostname, &w.IPAddress, &w.PID,
			&w.Version, &w.ConfigPath, &w.OSInfo,
			&w.MachineCount, &w.StartedAt, &w.HeartbeatAt,
		); err != nil {
			return nil, err
		}
		workers = append(workers, w)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return workers, nil
}

// GetWorker returns a worker with its machines and last 10 commands.
// Returns pgx.ErrNoRows if the worker does not exist.
func (s *Store) GetWorker(ctx context.Context, workerID string) (*WorkerDetail, error) {
	var detail WorkerDetail

	err := s.db.QueryRow(ctx, `
		SELECT
			w.id,
			w.name,
			w.status,
			w.hostname,
			w.ip_address,
			w.pid,
			w.version,
			w.config_path,
			w.os_info,
			COUNT(mw.machine_id) AS machine_count,
			w.started_at,
			w.heartbeat_at
		FROM workers w
		LEFT JOIN machine_workers mw ON mw.worker_ref_id = w.id
		WHERE w.id = $1
		GROUP BY w.id
	`, workerID).Scan(
		&detail.ID, &detail.Name, &detail.Status,
		&detail.Hostname, &detail.IPAddress, &detail.PID,
		&detail.Version, &detail.ConfigPath, &detail.OSInfo,
		&detail.MachineCount, &detail.StartedAt, &detail.HeartbeatAt,
	)
	if err != nil {
		return nil, err
	}

	// Fetch associated machines.
	mrows, err := s.db.Query(ctx, `
		SELECT m.id, m.name, m.status, pl.name AS line_name
		FROM machine_workers mw
		JOIN machines m ON m.id = mw.machine_id
		JOIN production_lines pl ON pl.id = m.line_id
		WHERE mw.worker_ref_id = $1
		ORDER BY pl.name, m.name
	`, workerID)
	if err != nil {
		return nil, err
	}
	defer mrows.Close()

	detail.Machines = []WorkerMachine{}
	for mrows.Next() {
		var m WorkerMachine
		if err := mrows.Scan(&m.ID, &m.Name, &m.Status, &m.LineName); err != nil {
			return nil, err
		}
		detail.Machines = append(detail.Machines, m)
	}
	if err := mrows.Err(); err != nil {
		return nil, err
	}

	// Fetch last 10 commands.
	crows, err := s.db.Query(ctx, `
		SELECT id, command, status, result, created_at, started_at, completed_at
		FROM worker_commands
		WHERE worker_id = $1
		ORDER BY created_at DESC
		LIMIT 10
	`, workerID)
	if err != nil {
		return nil, err
	}
	defer crows.Close()

	detail.RecentCommands = []CommandSummary{}
	for crows.Next() {
		var c CommandSummary
		if err := crows.Scan(&c.ID, &c.Command, &c.Status, &c.Result, &c.CreatedAt, &c.StartedAt, &c.CompletedAt); err != nil {
			return nil, err
		}
		detail.RecentCommands = append(detail.RecentCommands, c)
	}
	if err := crows.Err(); err != nil {
		return nil, err
	}

	return &detail, nil
}

// SendCommand inserts a pending command for a worker.
// Returns ErrWorkerNotFound if the worker does not exist, ErrWorkerOffline if not online.
func (s *Store) SendCommand(ctx context.Context, workerID, command string) (*Command, error) {
	var status string
	err := s.db.QueryRow(ctx,
		`SELECT status FROM workers WHERE id = $1`, workerID,
	).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrWorkerNotFound
		}
		return nil, err
	}
	if status != "online" {
		return nil, ErrWorkerOffline
	}

	var cmd Command
	err = s.db.QueryRow(ctx, `
		INSERT INTO worker_commands (worker_id, command, status)
		VALUES ($1, $2, 'pending')
		RETURNING id, worker_id, command, status, result, created_at, started_at, completed_at
	`, workerID, command).Scan(
		&cmd.ID, &cmd.WorkerID, &cmd.Command, &cmd.Status,
		&cmd.Result, &cmd.CreatedAt, &cmd.StartedAt, &cmd.CompletedAt,
	)
	if err != nil {
		return nil, err
	}
	return &cmd, nil
}

// ListCommands returns paginated commands for a worker plus the total count.
func (s *Store) ListCommands(ctx context.Context, workerID string, limit, offset int) ([]Command, int, error) {
	var total int
	err := s.db.QueryRow(ctx,
		`SELECT COUNT(*) FROM worker_commands WHERE worker_id = $1`, workerID,
	).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.Query(ctx, `
		SELECT id, worker_id, command, status, result, created_at, started_at, completed_at
		FROM worker_commands
		WHERE worker_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, workerID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	commands := []Command{}
	for rows.Next() {
		var c Command
		if err := rows.Scan(
			&c.ID, &c.WorkerID, &c.Command, &c.Status,
			&c.Result, &c.CreatedAt, &c.StartedAt, &c.CompletedAt,
		); err != nil {
			return nil, 0, err
		}
		commands = append(commands, c)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	return commands, total, nil
}
