CREATE TABLE data_points (
    time TIMESTAMPTZ NOT NULL,
    machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    value DOUBLE PRECISION NOT NULL
);

SELECT create_hypertable('data_points', 'time');

CREATE INDEX idx_data_points_machine_metric ON data_points (machine_id, metric_name, time DESC);
