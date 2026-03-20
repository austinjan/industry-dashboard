-- Seed system permissions
INSERT INTO permissions (code, group_name, description) VALUES
    ('dashboard:view', 'Dashboard', 'View dashboards'),
    ('dashboard:create', 'Dashboard', 'Create dashboards'),
    ('dashboard:edit', 'Dashboard', 'Edit dashboards'),
    ('dashboard:delete', 'Dashboard', 'Delete dashboards'),
    ('dashboard:share', 'Dashboard', 'Share dashboards with others'),
    ('machine:view', 'Machine & Data', 'View machines and production lines'),
    ('machine:edit', 'Machine & Data', 'Edit machine configuration'),
    ('datapoint:view', 'Machine & Data', 'View sensor data'),
    ('datapoint:export', 'Machine & Data', 'Export sensor data'),
    ('alert:view', 'Alerts', 'View alerts'),
    ('alert:create', 'Alerts', 'Create alert rules'),
    ('alert:manage', 'Alerts', 'Manage alert rules'),
    ('alert:acknowledge', 'Alerts', 'Acknowledge triggered alerts'),
    ('user:manage', 'Admin', 'Manage users'),
    ('role:manage', 'Admin', 'Manage roles and permissions'),
    ('site:manage', 'Admin', 'Manage sites'),
    ('audit:view', 'Admin', 'View audit logs');

-- Seed default role templates
INSERT INTO roles (name, description, is_system) VALUES
    ('Admin', 'Full access to all features and all sites', true),
    ('Manager', 'Manage dashboards, alerts, and view data for assigned sites', true),
    ('Operator', 'View data, create personal dashboards, acknowledge alerts', true),
    ('Viewer', 'Read-only access to assigned sites', true);

-- Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'Admin';

-- Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager' AND p.code IN (
    'dashboard:view', 'dashboard:create', 'dashboard:edit', 'dashboard:delete', 'dashboard:share',
    'machine:view', 'datapoint:view', 'datapoint:export',
    'alert:view', 'alert:create', 'alert:manage', 'alert:acknowledge',
    'audit:view'
);

-- Operator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Operator' AND p.code IN (
    'dashboard:view', 'dashboard:create',
    'machine:view', 'datapoint:view',
    'alert:view', 'alert:acknowledge'
);

-- Viewer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Viewer' AND p.code IN (
    'dashboard:view',
    'machine:view', 'datapoint:view',
    'alert:view'
);
