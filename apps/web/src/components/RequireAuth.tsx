import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../hooks/useApi';
import { ApiError } from '../lib/api';
import { isNavTabAllowed, landingPath } from '../lib/navTabs';

/** ログイン切れ(401)のときだけログイン画面へ。携帯で開いた直後の通信エラー等ではログイン画面に飛ばさない */
export function isLoggedOutError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function AuthRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 8 }}>通信できませんでした。電波の良い所で再読み込みしてください。</div>
      <button className="btn btn-primary" onClick={onRetry}>再読み込み</button>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, error, refetch } = useMe();
  const { pathname } = useLocation();

  if (isLoading) return <div style={{ padding: 24 }}>読み込み中...</div>;
  if (!data) {
    if (error && !isLoggedOutError(error)) return <AuthRetry onRetry={() => void refetch()} />;
    return <Navigate to="/login" replace />;
  }
  // タブ表示で外されている画面は、URL を直接開いても見せない(要望)
  if (!isNavTabAllowed(pathname, data.visibleTabs)) return <Navigate to={landingPath(data.visibleTabs)} replace />;

  return <>{children}</>;
}

/** 「/」を開いたときの行き先(タブ表示の設定で見られる画面へ) */
export function HomeRedirect() {
  const { data, isLoading, error, refetch } = useMe();
  if (isLoading) return <div style={{ padding: 24 }}>読み込み中...</div>;
  if (!data) {
    if (error && !isLoggedOutError(error)) return <AuthRetry onRetry={() => void refetch()} />;
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={landingPath(data.visibleTabs)} replace />;
}
