package worker

import (
	"context"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Runner struct {
	db           *pgxpool.Pool
	alertEval    *AlertEvaluator
	pollInterval time.Duration
}

func NewRunner(db *pgxpool.Pool, pollInterval time.Duration) *Runner {
	return &Runner{
		db:           db,
		alertEval:    NewAlertEvaluator(db),
		pollInterval: pollInterval,
	}
}

func (r *Runner) RunMachine(ctx context.Context, machine ProvisionedMachine) {
	log.Printf("Starting data collection for %s", machine.Name)
	if machine.DataSource == nil {
		log.Printf("ERROR: no DataSource for %s, skipping", machine.Name)
		return
	}
	defer machine.DataSource.Close()

	ticker := time.NewTicker(r.pollInterval)
	defer ticker.Stop()

	consecutiveErrors := 0

	for {
		select {
		case <-ctx.Done():
			log.Printf("Stopping %s", machine.Name)
			return
		case <-ticker.C:
			result, err := machine.DataSource.Read(ctx)
			if err != nil {
				consecutiveErrors++
				log.Printf("Error reading %s: %v (consecutive: %d)", machine.Name, err, consecutiveErrors)
				if consecutiveErrors >= 3 {
					r.updateMachineStatus(ctx, machine.ID, "error")
				}
				continue
			}
			consecutiveErrors = 0
			r.updateMachineStatus(ctx, machine.ID, "running")
			r.writeDataPoints(ctx, machine.ID, result.Values)
			if len(result.Strings) > 0 {
				r.writeStringMetadata(ctx, machine.ID, result.Strings)
			}
			r.alertEval.Evaluate(ctx, machine.ID, result.Values)
		}
	}
}

func (r *Runner) updateMachineStatus(ctx context.Context, machineID, status string) {
	_, err := r.db.Exec(ctx,
		`UPDATE machines SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, machineID,
	)
	if err != nil {
		log.Printf("Error updating machine %s status: %v", machineID, err)
	}
}

func (r *Runner) writeDataPoints(ctx context.Context, machineID string, values map[string]float64) {
	for metricName, value := range values {
		_, err := r.db.Exec(ctx,
			`INSERT INTO data_points (time, machine_id, metric_name, value) VALUES (NOW(), $1, $2, $3)`,
			machineID, metricName, value,
		)
		if err != nil {
			log.Printf("Error writing %s/%s: %v", machineID, metricName, err)
		}
	}
}

func (r *Runner) writeStringMetadata(ctx context.Context, machineID string, strings map[string]string) {
	for key, value := range strings {
		_, err := r.db.Exec(ctx,
			`INSERT INTO machine_metadata (machine_id, key, value, updated_at)
			 VALUES ($1, $2, $3, NOW())
			 ON CONFLICT (machine_id, key) DO UPDATE
			 SET value = EXCLUDED.value, updated_at = NOW()
			 WHERE machine_metadata.value != EXCLUDED.value`,
			machineID, key, value,
		)
		if err != nil {
			log.Printf("Error writing metadata %s/%s: %v", machineID, key, err)
		}
	}
}
