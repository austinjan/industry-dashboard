package user

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Name      string    `json:"name"`
	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
}

type UserWithRoles struct {
	User
	Roles []UserRole `json:"roles"`
}

type UserRole struct {
	ID       string  `json:"id"`
	RoleName string  `json:"role_name"`
	RoleID   string  `json:"role_id"`
	SiteID   *string `json:"site_id"`
	SiteName *string `json:"site_name"`
}

func (s *Store) ListUsers(ctx context.Context) ([]UserWithRoles, error) {
	rows, err := s.db.Query(ctx,
		`SELECT id, email, name, is_active, created_at FROM users ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []UserWithRoles
	for rows.Next() {
		var u UserWithRoles
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range users {
		roles, err := s.GetUserRoles(ctx, users[i].ID)
		if err != nil {
			return nil, err
		}
		users[i].Roles = roles
	}
	return users, nil
}

func (s *Store) GetUserRoles(ctx context.Context, userID string) ([]UserRole, error) {
	rows, err := s.db.Query(ctx,
		`SELECT usr.id, r.name, r.id, usr.site_id, s.name
		 FROM user_site_roles usr
		 JOIN roles r ON usr.role_id = r.id
		 LEFT JOIN sites s ON usr.site_id = s.id
		 WHERE usr.user_id = $1
		 ORDER BY r.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roles []UserRole
	for rows.Next() {
		var r UserRole
		if err := rows.Scan(&r.ID, &r.RoleName, &r.RoleID, &r.SiteID, &r.SiteName); err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	return roles, rows.Err()
}

func (s *Store) GetUserLocale(ctx context.Context, userID string) (*string, error) {
	var locale *string
	err := s.db.QueryRow(ctx,
		"SELECT locale FROM users WHERE id = $1", userID).Scan(&locale)
	if err != nil {
		return nil, err
	}
	return locale, nil
}

var ValidLocales = map[string]bool{
	"en":    true,
	"zh-TW": true,
	"th":    true,
	"vi":    true,
}

func (s *Store) UpdateUserLocale(ctx context.Context, userID string, locale string) error {
	if !ValidLocales[locale] {
		return fmt.Errorf("invalid locale: %s", locale)
	}
	_, err := s.db.Exec(ctx,
		"UPDATE users SET locale = $1, updated_at = NOW() WHERE id = $2",
		locale, userID)
	return err
}
