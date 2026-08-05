import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../hooks/useApi';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useMe();

  if (isLoading) return <div style={{ padding: 24 }}>読み込み中...</div>;
  if (isError || !data) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
