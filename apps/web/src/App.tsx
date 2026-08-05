import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { TossCasesListPage } from './pages/toss-cases/TossCasesListPage';
import { TossCaseDetailPage } from './pages/toss-cases/TossCaseDetailPage';
import { RequireAuth } from './components/RequireAuth';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAuth>
              <DashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/toss-cases"
          element={
            <RequireAuth>
              <TossCasesListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/toss-cases/:id"
          element={
            <RequireAuth>
              <TossCaseDetailPage />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
