import { useState, useCallback, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ReactGridLayout, WidthProvider } from 'react-grid-layout/legacy';
import type { Layout } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { RefreshCw, Maximize, Minimize } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { WidgetRenderer } from '@/components/widgets/WidgetRenderer';
import { useDashboard } from '@/lib/hooks';

const GridLayout = WidthProvider(ReactGridLayout);

export function DashboardViewPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const { data: dashboard, isLoading } = useDashboard(id);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  if (isLoading) return <div className="text-slate-400">Loading dashboard...</div>;
  if (!dashboard) return <div className="text-slate-400">Dashboard not found.</div>;

  const layout = (dashboard.widgets || []).map((w: any) => ({
    i: w.id,
    x: w.position_x,
    y: w.position_y,
    w: w.width,
    h: w.height,
  }));

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-[9999] overflow-auto bg-slate-50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">{dashboard.title}</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              {t('common.refresh')}
            </Button>
            <Button size="sm" variant="outline" onClick={toggleFullscreen}>
              <Minimize className="h-4 w-4 mr-1" />
              {t('dashboardView.exitFullscreen')}
            </Button>
          </div>
        </div>
        <GridLayout
          className="layout"
          layout={layout as unknown as Layout}
          cols={12}
          rowHeight={80}
          isDraggable={false}
          isResizable={false}
        >
          {dashboard.widgets.map((w: any) => (
            <div key={w.id}>
              <WidgetRenderer widgetType={w.widget_type} config={w.config} />
            </div>
          ))}
        </GridLayout>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{dashboard.title}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t('common.refresh')}
          </Button>
          <Button size="sm" variant="outline" onClick={toggleFullscreen}>
            <Maximize className="h-4 w-4 mr-1" />
            {t('dashboardView.fullscreen')}
          </Button>
          {dashboard.access_level === 'edit' && (
            <Link to={`/dashboards/${id}/edit`}>
              <Button size="sm" variant="outline">Edit</Button>
            </Link>
          )}
        </div>
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
            <div key={w.id}>
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
