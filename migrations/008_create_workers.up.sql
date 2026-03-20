CREATE TABLE machine_workers (
    machine_id UUID PRIMARY KEY REFERENCES machines(id) ON DELETE CASCADE,
    worker_id VARCHAR(255) NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_machine_workers_heartbeat ON machine_workers(heartbeat_at);
