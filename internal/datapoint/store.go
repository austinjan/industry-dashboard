package datapoint

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

type DataPoint struct {
	Time  time.Time `json:"time"`
	Value float64   `json:"value"`
}

func (s *Store) GetTimeSeries(ctx context.Context, machineID, metricName, timeRange string) ([]DataPoint, error) {
	interval := "1 hour"
	switch timeRange {
	case "1h":
		interval = "1 minute"
	case "6h":
		interval = "5 minutes"
	case "24h":
		interval = "15 minutes"
	case "7d":
		interval = "1 hour"
	case "30d":
		interval = "6 hours"
	}
	rows, err := s.db.Query(ctx,
		`SELECT time_bucket($1::interval, time) AS bucket, AVG(value) AS avg_value
		 FROM data_points
		 WHERE machine_id = $2 AND metric_name = $3 AND time > NOW() - $4::interval
		 GROUP BY bucket
		 ORDER BY bucket`,
		interval, machineID, metricName, timeRange)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var points []DataPoint
	for rows.Next() {
		var p DataPoint
		if err := rows.Scan(&p.Time, &p.Value); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

func (s *Store) GetMachineMetrics(ctx context.Context, machineID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT metric_name FROM data_points WHERE machine_id = $1 ORDER BY metric_name`,
		machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var metrics []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, rows.Err()
}

func (s *Store) GetLatestValues(ctx context.Context, machineID string) (map[string]float64, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT ON (metric_name) metric_name, value
		 FROM data_points
		 WHERE machine_id = $1
		 ORDER BY metric_name, time DESC`,
		machineID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make(map[string]float64)
	for rows.Next() {
		var name string
		var value float64
		if err := rows.Scan(&name, &value); err != nil {
			return nil, err
		}
		values[name] = value
	}
	return values, rows.Err()
}
