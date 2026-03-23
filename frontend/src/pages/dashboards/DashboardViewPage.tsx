import { useParams, Link } from 'react-router-dom';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import type { Layout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { Button } from '@/components/ui/button';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { useDashboard } from '@/lib/hooks';

const GridLayout = WidthProvider(ReactGridLayout);

export function DashboardViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: dashboard, isLoading } = useDashboard(id);

  if (isLoading) return <div className="text-slate-400">Loading dashboard...</div>;
  if (!dashboard) return <div className="text-slate-400">Dashboard not found.</div>;

  const layout = (dashboard.widgets || []).map((w: any) => ({
    i: w.id,
    x: w.position_x,
    y: w.position_y,
    w: w.width,
    h: w.height,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{dashboard.title}</h2>
        {dashboard.access_level === 'edit' && (
          <Link to={`/dashboards/${id}/edit`}>
            <Button size="sm" variant="outline">Edit</Button>
          </Link>
        )}
      </div>
      {dashboard.widgets && dashboard.widgets.length > 0 ? (
        <GridLayout
          className="layout"
          layout={layout as unknown as Layout}
          cols={12}
          rowHeight={80}
          isDraggable={false}
          isResizable={false}
        >
          {dashboard.widgets.map((w: any) => (
            <div key={w.id} className="rounded-lg border bg-white p-3 shadow-sm">
              <WidgetRenderer widgetType={w.widget_type} config={w.config} />
            </div>
          ))}
        </GridLayout>
      ) : (
        <p className="text-slate-400">This dashboard has no widgets yet.</p>
      )}
    </div>
  );
}
