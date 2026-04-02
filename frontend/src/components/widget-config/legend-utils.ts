export interface LegendDisplay {
  show_site: boolean;
  show_line: boolean;
  show_machine: boolean;
}

export function buildLegendLabel(
  ds: { label: string; metric: string; site_name?: string; line_name?: string; machine_name?: string },
  display?: LegendDisplay,
): string {
  if (ds.label) return ds.label;
  const parts: string[] = [];
  if (display?.show_site && ds.site_name) parts.push(ds.site_name);
  if (display?.show_line && ds.line_name) parts.push(ds.line_name);
  if (display?.show_machine && ds.machine_name) parts.push(ds.machine_name);
  parts.push(ds.metric);
  return parts.join(' : ');
}
