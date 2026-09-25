import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import VehiclesPage from './pages/admin/VehiclesPage';
import RoutesPage from './pages/admin/RoutesPage';
import StopsPage from './pages/admin/StopsPage';
import HomePage from './pages/HomePage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const restoring = useAuthStore(s => s.restoring);
  const restore = useAuthStore(s => s.restore);
  useEffect(() => { void restore(); }, [restore]);
  if (!isAuthenticated && restoring) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-slate-400">Checking session…</div>;
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<HomePage />} />

        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />

        {/* Admin */}
        <Route path="/admin" element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="stops" element={<StopsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
