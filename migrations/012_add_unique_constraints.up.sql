CREATE UNIQUE INDEX idx_production_lines_site_name ON production_lines(site_id, name);
CREATE UNIQUE INDEX idx_machines_line_name ON machines(line_id, name);
