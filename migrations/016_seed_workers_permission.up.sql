INSERT INTO permissions (code, group_name, description) VALUES
    ('workers:manage', 'Admin', 'Manage workers (view, send commands)')
ON CONFLICT (code) DO NOTHING;

-- Grant to Admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Admin' AND p.code = 'workers:manage'
ON CONFLICT DO NOTHING;

-- Grant to Manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager' AND p.code = 'workers:manage'
ON CONFLICT DO NOTHING;
