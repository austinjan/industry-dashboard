package worker

import (
	"context"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AlertEvaluator struct {
	db *pgxpool.Pool
}

func NewAlertEvaluator(db *pgxpool.Pool) *AlertEvaluator {
	return &AlertEvaluator{db: db}
}

type alertRule struct {
	ID        string
	Name      string
	Metric    string
	Condition string
	Threshold float64
}

func (e *AlertEvaluator) Evaluate(ctx context.Context, machineID string, values map[string]float64) {
	rows, err := e.db.Query(ctx,
		`SELECT id, name, metric_name, condition, threshold
		 FROM alerts
		 WHERE machine_id = $1 AND is_active = true`,
		machineID,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	var rules []alertRule
	for rows.Next() {
		var r alertRule
		if err := rows.Scan(&r.ID, &r.Name, &r.Metric, &r.Condition, &r.Threshold); err != nil {
			continue
		}
		rules = append(rules, r)
	}

	for _, rule := range rules {
		value, ok := values[rule.Metric]
		if !ok {
			continue
		}
		triggered := false
		switch rule.Condition {
		case ">":
			triggered = value > rule.Threshold
		case ">=":
			triggered = value >= rule.Threshold
		case "<":
			triggered = value < rule.Threshold
		case "<=":
			triggered = value <= rule.Threshold
		case "==":
			triggered = value == rule.Threshold
		}

		if triggered {
			var exists bool
			e.db.QueryRow(ctx,
				`SELECT EXISTS(SELECT 1 FROM alert_events WHERE alert_id = $1 AND resolved_at IS NULL)`,
				rule.ID,
			).Scan(&exists)

			if !exists {
				_, err := e.db.Exec(ctx,
					`INSERT INTO alert_events (alert_id, triggered_at, triggered_value) VALUES ($1, NOW(), $2)`,
					rule.ID, value,
				)
				if err == nil {
					log.Printf("  ALERT triggered: %s (value=%.2f %s %.2f)", rule.Name, value, rule.Condition, rule.Threshold)
				}
			}
		} else {
			e.db.Exec(ctx,
				`UPDATE alert_events SET resolved_at = NOW()
				 WHERE alert_id = $1 AND resolved_at IS NULL`,
				rule.ID,
			)
		}
	}
}
