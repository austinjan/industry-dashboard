package rbac

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	db *pgxpool.Pool
}

func NewStore(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

type Role struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	IsSystem    bool   `json:"is_system"`
}

type Permission struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	GroupName   string `json:"group_name"`
	Description string `json:"description"`
}

type UserSiteRole struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	RoleID string `json:"role_id"`
	SiteID string `json:"site_id"`
}

func (s *Store) GetUserPermissionsForSite(ctx context.Context, userID, siteID string) ([]string, error) {
	rows, err := s.db.Query(ctx,
		`SELECT DISTINCT p.code
		 FROM user_site_roles usr
		 JOIN role_permissions rp ON rp.role_id = usr.role_id
		 JOIN permissions p ON p.id = rp.permission_id
		 WHERE usr.user_id = $1 AND (usr.site_id = $2 OR usr.site_id IS NULL)`,
		userID, siteID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var perms []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return nil, err
		}
		perms = append(perms, code)
	}
	return perms, nil
}

func (s *Store) IsGlobalAdmin(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := s.db.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM user_site_roles usr
			JOIN roles r ON r.id = usr.role_id
			WHERE usr.user_id = $1 AND r.name = 'Admin' AND usr.site_id IS NULL
		)`, userID,
	).Scan(&exists)
	return exists, err
}

func (s *Store) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := s.db.Query(ctx, `SELECT id, name, description, is_system FROM roles ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roles []Role
	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.IsSystem); err != nil {
			return nil, err
		}
		roles = append(roles, r)
	}
	return roles, nil
}

func (s *Store) ListPermissions(ctx context.Context) ([]Permission, error) {
	rows, err := s.db.Query(ctx, `SELECT id, code, group_name, description FROM permissions ORDER BY group_name, code`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.ID, &p.Code, &p.GroupName, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}

func (s *Store) CreateRole(ctx context.Context, name, description string, permissionIDs []string) (*Role, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var role Role
	err = tx.QueryRow(ctx,
		`INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING id, name, description, is_system`,
		name, description,
	).Scan(&role.ID, &role.Name, &role.Description, &role.IsSystem)
	if err != nil {
		return nil, err
	}
	for _, pid := range permissionIDs {
		_, err = tx.Exec(ctx,
			`INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)`,
			role.ID, pid,
		)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &role, nil
}

func (s *Store) AssignUserSiteRole(ctx context.Context, userID, roleID, siteID string) error {
	_, err := s.db.Exec(ctx,
		`INSERT INTO user_site_roles (user_id, role_id, site_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, role_id, site_id) DO NOTHING`,
		userID, roleID, siteID,
	)
	return err
}

func (s *Store) RemoveUserSiteRole(ctx context.Context, id string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM user_site_roles WHERE id = $1`, id)
	return err
}

func (s *Store) GetRolePermissions(ctx context.Context, roleID string) ([]Permission, error) {
	rows, err := s.db.Query(ctx,
		`SELECT p.id, p.code, p.group_name, p.description
		 FROM permissions p
		 JOIN role_permissions rp ON rp.permission_id = p.id
		 WHERE rp.role_id = $1
		 ORDER BY p.group_name, p.code`,
		roleID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var perms []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.ID, &p.Code, &p.GroupName, &p.Description); err != nil {
			return nil, err
		}
		perms = append(perms, p)
	}
	return perms, nil
}
