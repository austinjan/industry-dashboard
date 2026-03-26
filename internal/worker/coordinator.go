package worker

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"runtime"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CommandHandler is called by PollCommands for each pending command.
type CommandHandler func(ctx context.Context, command string, params []byte) error

type Coordinator struct {
	db                *pgxpool.Pool
	workerID          string // legacy hostname-PID string
	workerName        string // from config YAML or fallback to workerID
	workerDBID        string // UUID from workers table, set during Register()
	configPath        string // frozen config path for reload_config
	configJSON        []byte // running config as JSON for upload to DB
	version           string // build version
	heartbeatInterval time.Duration
	staleThreshold    time.Duration
	commandInterval   time.Duration
	machineCancels    map[string]context.CancelFunc
}

func NewCoordinator(db *pgxpool.Pool, workerName, configPath string, configJSON []byte, version string) *Coordinator {
	hostname, _ := os.Hostname()
	workerID := fmt.Sprintf("%s-%d", hostname, os.Getpid())
	if workerName == "" {
		workerName = workerID
	}
	return &Coordinator{
		db:                db,
		workerID:          workerID,
		workerName:        workerName,
		configPath:        configPath,
		configJSON:        configJSON,
		version:           version,
		heartbeatInterval: 30 * time.Second,
		staleThreshold:    90 * time.Second,
		commandInterval:   10 * time.Second,
		machineCancels:    make(map[string]context.CancelFunc),
	}
}

// Exported getters

func (c *Coordinator) WorkerID() string {
	return c.workerID
}

func (c *Coordinator) WorkerName() string {
	return c.workerName
}

func (c *Coordinator) WorkerDBID() string {
	return c.workerDBID
}

func (c *Coordinator) ConfigPath() string {
	return c.configPath
}

func (c *Coordinator) MachineCancels() map[string]context.CancelFunc {
	return c.machineCancels
}

// Register registers this worker in the workers table with stale takeover support.
func (c *Coordinator) Register(ctx context.Context) error {
	hostname, _ := os.Hostname()
	ip := getLocalIP()
	pid := os.Getpid()
	osInfo := fmt.Sprintf("%s/%s", runtime.GOOS, runtime.GOARCH)

	tx, err := c.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	var (
		existingID          string
		existingIP          string
		secondsSinceHeartbeat float64
	)
	err = tx.QueryRow(ctx,
		`SELECT id, COALESCE(ip_address, ''), EXTRACT(EPOCH FROM (NOW() - heartbeat_at))
		 FROM workers WHERE name = $1 FOR UPDATE`,
		c.workerName,
	).Scan(&existingID, &existingIP, &secondsSinceHeartbeat)

	if err == pgx.ErrNoRows {
		// Not found — INSERT new worker
		var newID string
		err = tx.QueryRow(ctx,
			`INSERT INTO workers (name, status, hostname, ip_address, pid, version, config_path, config_json, os_info, started_at, heartbeat_at)
			 VALUES ($1, 'online', $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
			 RETURNING id`,
			c.workerName, hostname, ip, pid, c.version, c.configPath, c.configJSON, osInfo,
		).Scan(&newID)
		if err != nil {
			return fmt.Errorf("failed to insert worker: %w", err)
		}
		c.workerDBID = newID
	} else if err != nil {
		return fmt.Errorf("failed to query existing worker: %w", err)
	} else if secondsSinceHeartbeat > c.staleThreshold.Seconds() {
		// Found but stale — take over
		_, err = tx.Exec(ctx,
			`UPDATE workers SET
			   status = 'online',
			   hostname = $2,
			   ip_address = $3,
			   pid = $4,
			   version = $5,
			   config_path = $6,
			   config_json = $7,
			   os_info = $8,
			   started_at = NOW(),
			   heartbeat_at = NOW(),
			   updated_at = NOW()
			 WHERE id = $1`,
			existingID, hostname, ip, pid, c.version, c.configPath, c.configJSON, osInfo,
		)
		if err != nil {
			return fmt.Errorf("failed to take over stale worker: %w", err)
		}
		c.workerDBID = existingID
	} else {
		// Found and alive — refuse
		return fmt.Errorf("worker %q is already running on %s (last heartbeat: %.0fs ago)",
			c.workerName, existingIP, secondsSinceHeartbeat)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("failed to commit registration: %w", err)
	}

	log.Printf("Registered worker %q (db id: %s)", c.workerName, c.workerDBID)
	return nil
}

// ClaimMachines inserts or updates machine_workers rows for the given machine IDs.
func (c *Coordinator) ClaimMachines(ctx context.Context, machineIDs []string) error {
	for _, id := range machineIDs {
		_, err := c.db.Exec(ctx,
			`INSERT INTO machine_workers (machine_id, worker_id, claimed_at, heartbeat_at, worker_ref_id)
			 VALUES ($1, $2, NOW(), NOW(), $3)
			 ON CONFLICT (machine_id) DO UPDATE SET
			   worker_id = EXCLUDED.worker_id,
			   worker_ref_id = EXCLUDED.worker_ref_id,
			   claimed_at = NOW(),
			   heartbeat_at = NOW()
			 WHERE machine_workers.heartbeat_at < NOW() - interval '90 seconds'
			    OR machine_workers.worker_id = $2`,
			id, c.workerID, c.workerDBID,
		)
		if err != nil {
			return fmt.Errorf("failed to claim machine %s: %w", id, err)
		}
	}
	log.Printf("Claimed %d machines as worker %s", len(machineIDs), c.workerID)
	return nil
}

// StartHeartbeat runs a loop updating both workers and machine_workers heartbeat timestamps.
func (c *Coordinator) StartHeartbeat(ctx context.Context, machineIDs []string) {
	ticker := time.NewTicker(c.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if c.workerDBID != "" {
				_, err := c.db.Exec(ctx,
					`UPDATE workers SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = $1`,
					c.workerDBID,
				)
				if err != nil {
					log.Printf("Error updating worker heartbeat: %v", err)
				}
			}
			for _, id := range machineIDs {
				_, err := c.db.Exec(ctx,
					`UPDATE machine_workers SET heartbeat_at = NOW() WHERE machine_id = $1 AND worker_id = $2`,
					id, c.workerID,
				)
				if err != nil {
					log.Printf("Error updating machine heartbeat for %s: %v", id, err)
				}
			}
		}
	}
}

// PollCommands polls for pending commands on this worker and dispatches them to handler.
func (c *Coordinator) PollCommands(ctx context.Context, handler CommandHandler) {
	ticker := time.NewTicker(c.commandInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			c.processNextCommand(ctx, handler)
		}
	}
}

func (c *Coordinator) processNextCommand(ctx context.Context, handler CommandHandler) {
	if c.workerDBID == "" {
		return
	}

	tx, err := c.db.Begin(ctx)
	if err != nil {
		log.Printf("PollCommands: failed to begin transaction: %v", err)
		return
	}
	defer tx.Rollback(ctx)

	var (
		cmdID     string
		command   string
		paramsRaw []byte
	)
	err = tx.QueryRow(ctx,
		`SELECT id, command, params FROM worker_commands
		 WHERE worker_id = $1 AND status = 'pending'
		 ORDER BY created_at ASC
		 LIMIT 1
		 FOR UPDATE SKIP LOCKED`,
		c.workerDBID,
	).Scan(&cmdID, &command, &paramsRaw)
	if err == pgx.ErrNoRows {
		tx.Rollback(ctx)
		return
	}
	if err != nil {
		log.Printf("PollCommands: failed to fetch command: %v", err)
		return
	}

	// Mark in_progress
	_, err = tx.Exec(ctx,
		`UPDATE worker_commands SET status = 'in_progress', started_at = NOW() WHERE id = $1`,
		cmdID,
	)
	if err != nil {
		log.Printf("PollCommands: failed to mark in_progress: %v", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		log.Printf("PollCommands: failed to commit in_progress: %v", err)
		return
	}

	// For stop/restart: pre-mark completed BEFORE calling handler (process may not return)
	isTerminating := command == "stop" || command == "restart"
	if isTerminating {
		if _, err := c.db.Exec(context.Background(),
			`UPDATE worker_commands SET status = 'completed', result = 'ok', completed_at = NOW() WHERE id = $1`,
			cmdID,
		); err != nil {
			log.Printf("PollCommands: failed to pre-mark %s completed: %v", command, err)
		}
	}

	handlerErr := handler(ctx, command, paramsRaw)

	if handlerErr != nil {
		// For restart: if syscall.Exec fails, mark as failed (overrides the pre-mark)
		if _, err := c.db.Exec(context.Background(),
			`UPDATE worker_commands SET status = 'failed', completed_at = NOW(), result = $2 WHERE id = $1`,
			cmdID, handlerErr.Error(),
		); err != nil {
			log.Printf("PollCommands: failed to mark command failed: %v", err)
		}
	} else if !isTerminating {
		c.db.Exec(context.Background(),
			`UPDATE worker_commands SET status = 'completed', result = 'ok', completed_at = NOW() WHERE id = $1`,
			cmdID,
		)
	}
}

// ReleaseMachines removes machine_workers rows for the given machine IDs.
func (c *Coordinator) ReleaseMachines(ctx context.Context, machineIDs []string) {
	for _, id := range machineIDs {
		_, err := c.db.Exec(ctx,
			`DELETE FROM machine_workers WHERE machine_id = $1 AND worker_id = $2`,
			id, c.workerID,
		)
		if err != nil {
			log.Printf("Error releasing machine %s: %v", id, err)
		}
	}
	log.Printf("Released %d machines", len(machineIDs))
}

// SetOffline marks this worker as offline in the workers table.
func (c *Coordinator) SetOffline(ctx context.Context) {
	if c.workerDBID == "" {
		return
	}
	_, err := c.db.Exec(ctx,
		`UPDATE workers SET status = 'offline', updated_at = NOW() WHERE id = $1`,
		c.workerDBID,
	)
	if err != nil {
		log.Printf("Error setting worker offline: %v", err)
	}
}

// StoreMachineCancel stores a cancel function for a named machine.
func (c *Coordinator) StoreMachineCancel(name string, cancel context.CancelFunc) {
	c.machineCancels[name] = cancel
}

// CancelMachine calls the cancel function for the named machine and removes it.
func (c *Coordinator) CancelMachine(name string) {
	if cancel, ok := c.machineCancels[name]; ok {
		cancel()
		delete(c.machineCancels, name)
	}
}

// getLocalIP returns the first non-loopback IPv4 address found on the host.
func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipv4 := ipNet.IP.To4(); ipv4 != nil {
				return ipv4.String()
			}
		}
	}
	return ""
}
