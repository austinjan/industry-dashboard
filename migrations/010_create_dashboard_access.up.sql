CREATE TABLE dashboard_role_access (
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    access_level VARCHAR(10) NOT NULL DEFAULT 'view' CHECK (access_level IN ('view', 'edit')),
    PRIMARY KEY (dashboard_id, role_id)
);

CREATE INDEX idx_dashboard_role_access_role ON dashboard_role_access(role_id);
