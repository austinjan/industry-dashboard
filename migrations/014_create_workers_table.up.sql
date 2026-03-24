CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'online',
    hostname VARCHAR(255),
    ip_address VARCHAR(45),
    pid INTEGER,
    version VARCHAR(50),
    config_path TEXT,
    os_info VARCHAR(255),
    started_at TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE machine_workers ADD COLUMN worker_ref_id UUID REFERENCES workers(id);
