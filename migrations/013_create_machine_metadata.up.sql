CREATE TABLE IF NOT EXISTS machine_metadata (
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    key        VARCHAR(255) NOT NULL,
    value      TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (machine_id, key)
);
