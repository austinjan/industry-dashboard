package worker

import (
	"context"
	"log"
	"math/rand"
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
	log.Printf("Starting data generation for %s (interval: %s)", machine.Name, r.pollInterval)
	ticker := time.NewTicker(r.pollInterval)
	defer ticker.Stop()

	gen := NewGenerator()
	rng := rand.New(rand.NewSource(rand.Int63()))
	tick := 0

	for {
		select {
		case <-ctx.Done():
			log.Printf("Stopping %s", machine.Name)
			return
		case <-ticker.C:
			values := make(map[string]float64)
			for _, reg := range machine.Registers {
				value := gen.GenerateFor(reg.Name, reg.Fake.Pattern, reg.Fake.Min, reg.Fake.Max, tick)
				values[reg.Name] = value

				_, err := r.db.Exec(ctx,
					`INSERT INTO data_points (time, machine_id, metric_name, value) VALUES (NOW(), $1, $2, $3)`,
					machine.ID, reg.Name, value,
				)
				if err != nil {
					log.Printf("  Error writing %s/%s: %v", machine.Name, reg.Name, err)
				}
			}

			r.alertEval.Evaluate(ctx, machine.ID, values)

			// Occasionally toggle machine status to simulate issues
			if tick%60 == 0 && tick > 0 && rng.Float64() < 0.05 {
				r.db.Exec(ctx, `UPDATE machines SET status = 'error', updated_at = NOW() WHERE id = $1`, machine.ID)
				log.Printf("  %s status -> error", machine.Name)
			} else if tick%60 == 30 {
				r.db.Exec(ctx, `UPDATE machines SET status = 'running', updated_at = NOW() WHERE id = $1`, machine.ID)
			}

			tick++
		}
	}
}
