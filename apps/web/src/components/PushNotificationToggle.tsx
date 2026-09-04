import { useState } from 'react';
import { usePushNotifications } from '../lib/usePushNotifications';
import { api } from '../lib/api';

/** 商談リマインド・実施報告をこの端末のデスクトップ/スマホ通知で受け取るトグル */
export function PushNotificationToggle({ collapsed }: { collapsed: boolean }) {
  const { permission, subscribed, busy, error, enable } = usePushNotifications();
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const sendTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await api.post<{ ok: boolean; reason?: string }>('/push/test');
      setTestMsg(res.ok ? '送信しました。数秒以内に通知が出ます' : (res.reason ?? '送信できませんでした'));
    } catch {
      setTestMsg('送信に失敗しました');
    } finally {
      setTesting(false);
    }
  };

  if (permission === 'unsupported') return null;

  if (permission === 'granted' && subscribed) {
    return (
      <div style={{ padding: collapsed ? '4px 0' : '4px 9px', fontSize: 11 }}>
        <div
          title="商談リマインド・実施報告をこの端末の通知で受け取ります"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 6,
            color: 'var(--color-text-faint)',
          }}
        >
          <span>🔔</span>
          {!collapsed && <span>通知ON（この端末）</span>}
        </div>
        {!collapsed && (
          <>
            <button
              onClick={sendTest}
              disabled={testing}
              style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}
            >
              {testing ? '送信中...' : 'テスト通知を送る'}
            </button>
            {testMsg && <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{testMsg}</p>}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={enable}
        disabled={busy}
        title="デスクトップ/スマホ通知を有効にする"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 8,
          padding: collapsed ? '8px 0' : '8px 10px',
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <span>🔕</span>
        {!collapsed && <span>{busy ? '設定中...' : '通知を有効にする'}</span>}
      </button>
      {!collapsed && error && <p style={{ fontSize: 11, color: 'var(--color-danger)', padding: '0 10px' }}>{error}</p>}
    </div>
  );
}
