package audit

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Entry struct {
	UserID       string
	Action       string
	ResourceType string
	ResourceID   string
	Details      map[string]interface{}
	IPAddress    string
	Timestamp    time.Time
}

type Logger interface {
	Log(ctx context.Context, entry Entry) error
}

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) Log(ctx context.Context, entry Entry) error {
	details, _ := json.Marshal(entry.Details)
	var ipAddr interface{}
	if entry.IPAddress != "" {
		ipAddr = entry.IPAddress
	}
	_, err := s.db.Exec(ctx,
		`INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, timestamp)
		 VALUES ($1, $2, $3, $4, $5, $6::inet, $7)`,
		entry.UserID, entry.Action, entry.ResourceType, entry.ResourceID, details, ipAddr, entry.Timestamp,
	)
	return err
}

type AuditLog struct {
	ID           string                 `json:"id"`
	UserID       string                 `json:"user_id"`
	UserName     string                 `json:"user_name"`
	UserEmail    string                 `json:"user_email"`
	Action       string                 `json:"action"`
	ResourceType string                 `json:"resource_type"`
	ResourceID   string                 `json:"resource_id"`
	Details      map[string]interface{} `json:"details"`
	IPAddress    string                 `json:"ip_address"`
	Timestamp    time.Time              `json:"timestamp"`
}

type ListParams struct {
	SiteID       string
	UserID       string
	Action       string
	ResourceType string
	Limit        int
	Offset       int
}

func (s *Store) List(ctx context.Context, params ListParams) ([]AuditLog, error) {
	if params.Limit == 0 {
		params.Limit = 50
	}
	query := `SELECT al.id, al.user_id, COALESCE(u.name, ''), COALESCE(u.email, ''), al.action, al.resource_type, al.resource_id, al.details, host(al.ip_address), al.timestamp
		FROM audit_logs al
		LEFT JOIN users u ON al.user_id = u.id
		WHERE 1=1`
	args := []interface{}{}
	argIdx := 1
	if params.UserID != "" {
		query += ` AND al.user_id = $` + strconv.Itoa(argIdx)
		args = append(args, params.UserID)
		argIdx++
	}
	if params.Action != "" {
		query += ` AND al.action = $` + strconv.Itoa(argIdx)
		args = append(args, params.Action)
		argIdx++
	}
	if params.ResourceType != "" {
		query += ` AND al.resource_type = $` + strconv.Itoa(argIdx)
		args = append(args, params.ResourceType)
		argIdx++
	}
	query += ` ORDER BY al.timestamp DESC LIMIT $` + strconv.Itoa(argIdx) + ` OFFSET $` + strconv.Itoa(argIdx+1)
	args = append(args, params.Limit, params.Offset)
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []AuditLog
	for rows.Next() {
		var l AuditLog
		var details []byte
		var ipAddr *string
		if err := rows.Scan(&l.ID, &l.UserID, &l.UserName, &l.UserEmail, &l.Action, &l.ResourceType, &l.ResourceID, &details, &ipAddr, &l.Timestamp); err != nil {
			return nil, err
		}
		if details != nil {
			json.Unmarshal(details, &l.Details)
		}
		if ipAddr != nil {
			l.IPAddress = *ipAddr
		}
		logs = append(logs, l)
	}
	return logs, nil
}
