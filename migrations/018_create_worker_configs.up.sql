CREATE TABLE worker_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    poll_interval VARCHAR(20) NOT NULL DEFAULT '5s',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, site_id)
);

CREATE TABLE worker_config_machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES worker_configs(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 502,
    slave_id INTEGER NOT NULL DEFAULT 1,
    UNIQUE(config_id, machine_id)
);
