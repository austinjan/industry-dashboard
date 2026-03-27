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
	UpdatedAt  time.Time `json:"updated_at"`
}

type AlertEvent struct {
	ID             string     `json:"id"`
	AlertID        string     `json:"alert_id"`
	AlertName      string     `json:"alert_name"`
	LineID         string     `json:"line_id"`
	LineName       string     `json:"line_name"`
	MachineID      string     `json:"machine_id"`
	MachineName    string     `json:"machine_name"`
	MetricName     string     `json:"metric_name"`
	Condition      string     `json:"condition"`
	Threshold      float64    `json:"threshold"`
	Severity       string     `json:"severity"`
	TriggeredAt    time.Time  `json:"triggered_at"`
	TriggeredValue *float64   `json:"triggered_value"`
	ResolvedAt     *time.Time `json:"resolved_at"`
	AcknowledgedBy *string    `json:"acknowledged_by"`
}

type AlertEventListParams struct {
	SiteID    string
	Severity  string
	Status    string // "open", "acknowledged", "resolved", ""
	LineID    string
	MachineID string
	SortBy    string // "triggered_at", "severity", "alert_name", "machine_name"
	SortOrder string // "asc", "desc"
	Limit     int
	Offset    int
}

type AlertEventListResult struct {
	Events []AlertEvent `json:"events"`
	Total  int          `json:"total"`
}

func (s *Store) ListAlerts(ctx context.Context, siteID string) ([]Alert, error) {
	rows, err := s.db.Query(ctx,
		`SELECT a.id, a.name, a.machine_id, a.metric_name, a.condition, a.threshold, a.severity, a.is_active, a.created_at, a.updated_at
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
		if err := rows.Scan(&a.ID, &a.Name, &a.MachineID, &a.MetricName, &a.Condition, &a.Threshold, &a.Severity, &a.IsActive, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		alerts = append(alerts, a)
	}
	return alerts, rows.Err()
}

func (s *Store) ListAlertEvents(ctx context.Context, p AlertEventListParams) (*AlertEventListResult, error) {
	if p.Limit == 0 {
		p.Limit = 20
	}

	baseFrom := ` FROM alert_events ae
		JOIN alerts a ON ae.alert_id = a.id
		JOIN machines m ON a.machine_id = m.id
		JOIN production_lines pl ON m.line_id = pl.id
		WHERE pl.site_id = $1`
	args := []interface{}{p.SiteID}
	argIdx := 2

	if p.Severity != "" {
		baseFrom += ` AND a.severity = $` + strconv.Itoa(argIdx)
		args = append(args, p.Severity)
		argIdx++
	}
	if p.LineID != "" {
		baseFrom += ` AND pl.id = $` + strconv.Itoa(argIdx)
		args = append(args, p.LineID)
		argIdx++
	}
	if p.MachineID != "" {
		baseFrom += ` AND m.id = $` + strconv.Itoa(argIdx)
		args = append(args, p.MachineID)
		argIdx++
	}
	switch p.Status {
	case "open":
		baseFrom += ` AND ae.resolved_at IS NULL AND ae.acknowledged_by IS NULL`
	case "acknowledged":
		baseFrom += ` AND ae.acknowledged_by IS NOT NULL AND ae.resolved_at IS NULL`
	case "resolved":
		baseFrom += ` AND ae.resolved_at IS NOT NULL`
	}

	// Count total
	var total int
	countQuery := `SELECT COUNT(*)` + baseFrom
	if err := s.db.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, err
	}

	// Sort
	sortCol := "ae.triggered_at"
	switch p.SortBy {
	case "severity":
		sortCol = "a.severity"
	case "alert_name":
		sortCol = "a.name"
	case "machine_name":
		sortCol = "m.name"
	case "line_name":
		sortCol = "pl.name"
	}
	sortDir := "DESC"
	if p.SortOrder == "asc" {
		sortDir = "ASC"
	}

	selectCols := `SELECT ae.id, ae.alert_id, a.name, pl.id, pl.name, m.id, m.name, a.metric_name, a.condition, a.threshold, a.severity, ae.triggered_at, ae.triggered_value, ae.resolved_at, ae.acknowledged_by`
	query := selectCols + baseFrom + ` ORDER BY ` + sortCol + ` ` + sortDir +
		` LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, p.Limit, p.Offset)

	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var events []AlertEvent
	for rows.Next() {
		var e AlertEvent
		if err := rows.Scan(&e.ID, &e.AlertID, &e.AlertName, &e.LineID, &e.LineName, &e.MachineID, &e.MachineName, &e.MetricName, &e.Condition, &e.Threshold, &e.Severity, &e.TriggeredAt, &e.TriggeredValue, &e.ResolvedAt, &e.AcknowledgedBy); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &AlertEventListResult{Events: events, Total: total}, nil
}

func (s *Store) CreateAlert(ctx context.Context, name, machineID, metricName, condition string, threshold float64, severity string) (*Alert, error) {
	var a Alert
	err := s.db.QueryRow(ctx,
		`INSERT INTO alerts (name, machine_id, metric_name, condition, threshold, severity)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, machine_id, metric_name, condition, threshold, severity, is_active, created_at, updated_at`,
		name, machineID, metricName, condition, threshold, severity,
	).Scan(&a.ID, &a.Name, &a.MachineID, &a.MetricName, &a.Condition, &a.Threshold, &a.Severity, &a.IsActive, &a.CreatedAt, &a.UpdatedAt)
	return &a, err
}

func (s *Store) AcknowledgeAlertEvent(ctx context.Context, eventID, userID string) error {
	_, err := s.db.Exec(ctx,
		`UPDATE alert_events SET acknowledged_by = $1 WHERE id = $2`,
		userID, eventID)
	return err
}

func (s *Store) UpdateAlert(ctx context.Context, id string, name, metricName, condition string, threshold float64, severity string, isActive bool) (*Alert, error) {
	var alert Alert
	err := s.db.QueryRow(ctx,
		`UPDATE alerts
		 SET name = $2, metric_name = $3, condition = $4, threshold = $5, severity = $6, is_active = $7, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, name, machine_id, metric_name, condition, threshold, severity, is_active, created_at, updated_at`,
		id, name, metricName, condition, threshold, severity, isActive,
	).Scan(&alert.ID, &alert.Name, &alert.MachineID, &alert.MetricName, &alert.Condition, &alert.Threshold, &alert.Severity, &alert.IsActive, &alert.CreatedAt, &alert.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &alert, nil
}

func (s *Store) DeleteAlert(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM alerts WHERE id = $1`, id)
	return err
}

func (s *Store) BulkUpdateAlerts(ctx context.Context, ids []string, isActive bool) (int64, error) {
	ct, err := s.db.Exec(ctx,
		`UPDATE alerts SET is_active = $2, updated_at = NOW() WHERE id = ANY($1::uuid[])`,
		ids, isActive,
	)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}

func (s *Store) BulkDeleteAlerts(ctx context.Context, ids []string) (int64, error) {
	ct, err := s.db.Exec(ctx,
		`DELETE FROM alerts WHERE id = ANY($1::uuid[])`,
		ids,
	)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}

func (s *Store) AcknowledgeInfoEvents(ctx context.Context, siteID, userID string) (int64, error) {
	ct, err := s.db.Exec(ctx,
		`UPDATE alert_events ae
		 SET acknowledged_by = $2
		 FROM alerts a
		 JOIN machines m ON m.id = a.machine_id
		 JOIN production_lines pl ON pl.id = m.line_id
		 WHERE ae.alert_id = a.id
		   AND pl.site_id = $1
		   AND a.severity = 'info'
		   AND ae.resolved_at IS NULL
		   AND ae.acknowledged_by IS NULL`,
		siteID, userID,
	)
	if err != nil {
		return 0, err
	}
	return ct.RowsAffected(), nil
}
