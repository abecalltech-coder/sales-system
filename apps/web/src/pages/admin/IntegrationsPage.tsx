import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useGoogleCalendarStatus } from '../../hooks/useApi';
import { api } from '../../lib/api';

function GoogleCalendarIntegrationSection() {
  const { data: status, isLoading } = useGoogleCalendarStatus();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  // OAuthコールバック後は ?google=connected / error で戻ってくる
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('google');
    if (!p) return;
    setMessage(p === 'connected' ? 'Googleアカウントを連携しました' : '連携に失敗しました。もう一度お試しください');
    window.history.replaceState({}, '', window.location.pathname);
    queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
  }, [queryClient]);

  const connect = async () => {
    const { url } = await api.get<{ url: string }>('/integrations/google-calendar/auth-url');
    window.location.href = url;
  };
  const disconnectMutation = useMutation({
    mutationFn: () => api.post('/integrations/google-calendar/disconnect'),
    onSuccess: () => {
      setMessage('連携を解除しました');
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
  });

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Googleカレンダー・Meet連携</div>
      {message && <p style={{ fontSize: 12, color: 'var(--color-success)', marginBottom: 8 }}>{message}</p>}

      {isLoading ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</div>
      ) : !status?.configured ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--color-warning)' }}>サーバー側の設定が未完了です</div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.7 }}>
            Google Cloud Console で OAuth クライアント(種類: ウェブアプリケーション)を作成し、Railway の環境変数に
            <code> GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code> / <code>GOOGLE_TOKEN_ENCRYPTION_KEY</code> を設定してください。<br />
            承認済みリダイレクト URI には次を登録します:<br />
            <code>https://sales-systemapi-production.up.railway.app/api/integrations/google-calendar/callback</code>
          </p>
        </>
      ) : status.connected ? (
        <>
          <div style={{ fontSize: 13 }}>
            連携中: <b>{status.accountEmail ?? '(アカウント不明)'}</b>
            {status.connectedAt && (
              <span style={{ color: 'var(--color-text-faint)' }}> / {new Date(status.connectedAt).toLocaleString('ja-JP')}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0' }}>
            商談形式が「HPZOOM」のアポ詳細作成時に、このアカウントのカレンダーへ予定を作成し Google Meet の URL を自動発行します。
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={connect}>アカウントを切り替える</button>
            <button onClick={() => disconnectMutation.mutate()} disabled={disconnectMutation.isPending}>
              連携を解除
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>未連携</div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '8px 0' }}>
            Meet 発行に使う Google アカウントを接続します。
          </p>
          <button className="btn-primary" onClick={connect}>
            Googleアカウントを連携
          </button>
        </>
      )}
    </div>
  );
}

export function IntegrationsPage() {
  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 680 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>連携設定</h1>

        <GoogleCalendarIntegrationSection />
      </div>
    </AppLayout>
  );
}
