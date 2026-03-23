INSERT INTO widget_types (name, description, default_config) VALUES
    ('status_card', 'Single metric value with trend indicator', '{"width": 3, "height": 2}'),
    ('gauge', 'Radial gauge for OEE, utilization', '{"width": 3, "height": 3}'),
    ('line_chart', 'Time-series trend (multi-metric)', '{"width": 6, "height": 3}'),
    ('bar_chart', 'Compare values across machines or lines', '{"width": 6, "height": 3}'),
    ('pie_chart', 'Proportional breakdown', '{"width": 4, "height": 3}'),
    ('data_table', 'Sortable/filterable tabular data', '{"width": 6, "height": 4}'),
    ('alert_list', 'Filtered alert feed', '{"width": 4, "height": 3}'),
    ('machine_status', 'Compact machine overview grid', '{"width": 6, "height": 3}'),
    ('text_markdown', 'Free text notes with markdown support', '{"width": 4, "height": 2}');
