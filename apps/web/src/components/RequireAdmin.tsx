import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../hooks/useApi';

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();

  if (isLoading) return <div style={{ padding: 24 }}>読み込み中...</div>;
  if (isError || !data) return <Navigate to="/login" replace />;
  if (!data.roles.some((r) => ADMIN_ROLES.includes(r))) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
