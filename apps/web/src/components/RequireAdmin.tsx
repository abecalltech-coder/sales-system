import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../hooks/useApi';
import { AuthRetry, isLoggedOutError } from './RequireAuth';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useMe();

  if (isLoading) return <div style={{ padding: 24 }}>読み込み中...</div>;
  if (!data) {
    if (error && !isLoggedOutError(error)) return <AuthRetry onRetry={() => void refetch()} />;
    return <Navigate to="/login" replace />;
  }
  if (!data.roles.some((r) => ADMIN_ROLES.includes(r))) return <Navigate to="/toss-cases" replace />;

  return <>{children}</>;
}
