package alert

import (
	"context"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type Alert struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	MachineID  string    `json:"machine_id"`
	MetricName string    `json:"metric_name"`
	Condition  string    `json:"condition"`
	Threshold  float64   `json:"threshold"`
	Severity   string    `json:"severity"`
	IsActive   bool      `json:"is_active"`
	CreatedAt  time.Time `json:"created_at"`
}

type AlertEvent struct {
	ID             string     `json:"id"`
	AlertID        string     `json:"alert_id"`
	AlertName      string     `json:"alert_name"`
	MachineName    string     `json:"machine_name"`
	Severity       string     `json:"severity"`
	TriggeredAt    time.Time  `json:"triggered_at"`
	ResolvedAt     *time.Time `json:"resolved_at"`
	AcknowledgedBy *string    `json:"acknowledged_by"`
}

func (s *Store) ListAlerts(ctx context.Context, siteID string) ([]Alert, error) {
	rows, err := s.db.Query(ctx,
		`SELECT a.id, a.name, a.machine_id, a.metric_name, a.condition, a.threshold, a.severity, a.is_active, a.created_at
		 FROM alerts a
		 JOIN machines m ON a.machine_id = m.id
		 JOIN production_lines pl ON m.line_id = pl.id
		 WHERE pl.site_id = $1
		 ORDER BY a.created_at DESC`, siteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var alerts []Alert
	for rows.Next() {
		var a Alert
		if err := rows.Scan(&a.ID, &a.Name, &a.MachineID, &a.MetricName, &a.Condition, &a.Threshold, &a.Severity, &a.IsActive, &a.CreatedAt); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

func (s *Store) ListAlertEvents(ctx context.Context, siteID string, severity string, limit, offset int) ([]AlertEvent, error) {
	if limit == 0 {
		limit = 50
	}
	query := `SELECT ae.id, ae.alert_id, a.name, m.name, a.severity, ae.triggered_at, ae.resolved_at, ae.acknowledged_by
		FROM alert_events ae
		JOIN alerts a ON ae.alert_id = a.id
		JOIN machines m ON a.machine_id = m.id
		JOIN production_lines pl ON m.line_id = pl.id
		WHERE pl.site_id = $1`
	args := []interface{}{siteID}
	argIdx := 2
	if severity != "" {
		query += ` AND a.severity = $` + strconv.Itoa(argIdx)
		args = append(args, severity)
		argIdx++
	}
	query += ` ORDER BY ae.triggered_at DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, limit, offset)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []AlertEvent
	for rows.Next() {
		var e AlertEvent
		if err := rows.Scan(&e.ID, &e.AlertID, &e.AlertName, &e.MachineName, &e.Severity, &e.TriggeredAt, &e.ResolvedAt, &e.AcknowledgedBy); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, rows.Err()
}

func (s *Store) CreateAlert(ctx context.Context, name, machineID, metricName, condition string, threshold float64, severity string) (*Alert, error) {
	var a Alert
	err := s.db.QueryRow(ctx,
		`INSERT INTO alerts (name, machine_id, metric_name, condition, threshold, severity)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, machine_id, metric_name, condition, threshold, severity, is_active, created_at`,
		name, machineID, metricName, condition, threshold, severity,
	).Scan(&a.ID, &a.Name, &a.MachineID, &a.MetricName, &a.Condition, &a.Threshold, &a.Severity, &a.IsActive, &a.CreatedAt)
	return &a, err
}

func (s *Store) AcknowledgeAlertEvent(ctx context.Context, eventID, userID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE alert_events SET acknowledged_by = $1 WHERE id = $2`,
		userID, eventID)
	return err
}
