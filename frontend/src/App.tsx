import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/lib/auth';
import { SiteProvider } from '@/lib/site-context';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { MachineListPage } from '@/pages/MachineListPage';
import { MachineDetailPage } from '@/pages/MachineDetailPage';
import { AlertsPage } from '@/pages/AlertsPage';

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <SiteProvider>
                    <AppShell />
                  </SiteProvider>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/machines" element={<MachineListPage />} />
              <Route path="/machines/:machineId" element={<MachineDetailPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/reports" element={<div>Reports (coming soon)</div>} />
              <Route path="/dashboards" element={<div>My Dashboards (coming soon)</div>} />
              <Route path="/admin/users" element={<div>User Management (coming soon)</div>} />
              <Route path="/admin/roles" element={<div>RBAC Settings (coming soon)</div>} />
              <Route path="/admin/audit" element={<div>Audit Log (coming soon)</div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
