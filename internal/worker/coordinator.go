package worker

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Coordinator struct {
	db                *pgxpool.Pool
	workerID          string
	heartbeatInterval time.Duration
	staleThreshold    time.Duration
}

func NewCoordinator(db *pgxpool.Pool) *Coordinator {
	hostname, _ := os.Hostname()
	workerID := fmt.Sprintf("%s-%d", hostname, os.Getpid())
	return &Coordinator{
		db:                db,
		workerID:          workerID,
		heartbeatInterval: 30 * time.Second,
		staleThreshold:    90 * time.Second,
	}
}

func (c *Coordinator) WorkerID() string {
	return c.workerID
}

func (c *Coordinator) ClaimMachines(ctx context.Context, machineIDs []string) error {
	for _, id := range machineIDs {
		_, err := c.db.Exec(ctx,
			`INSERT INTO machine_workers (machine_id, worker_id, claimed_at, heartbeat_at)
			 VALUES ($1, $2, NOW(), NOW())
			 ON CONFLICT (machine_id) DO UPDATE SET
			   worker_id = EXCLUDED.worker_id,
			   claimed_at = NOW(),
			   heartbeat_at = NOW()
			 WHERE machine_workers.heartbeat_at < NOW() - interval '90 seconds'
			    OR machine_workers.worker_id = $2`,
			id, c.workerID,
		)
		if err != nil {
			return fmt.Errorf("failed to claim machine %s: %w", id, err)
		}
	}
	log.Printf("Claimed %d machines as worker %s", len(machineIDs), c.workerID)
	return nil
}

func (c *Coordinator) StartHeartbeat(ctx context.Context, machineIDs []string) {
	ticker := time.NewTicker(c.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for _, id := range machineIDs {
				c.db.Exec(ctx,
					`UPDATE machine_workers SET heartbeat_at = NOW() WHERE machine_id = $1 AND worker_id = $2`,
					id, c.workerID,
				)
			}
		}
	}
}

func (c *Coordinator) ReleaseMachines(ctx context.Context, machineIDs []string) {
	for _, id := range machineIDs {
		c.db.Exec(ctx,
			`DELETE FROM machine_workers WHERE machine_id = $1 AND worker_id = $2`,
			id, c.workerID,
		)
	}
	log.Printf("Released %d machines", len(machineIDs))
}
