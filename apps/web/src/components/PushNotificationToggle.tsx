import { usePushNotifications } from '../lib/usePushNotifications';

/** CLカレンダーのリマインド等をデスクトップ/スマホ通知で受け取れるようにするトグル(セクション追加要望) */
export function PushNotificationToggle({ collapsed }: { collapsed: boolean }) {
  const { permission, subscribed, busy, error, enable } = usePushNotifications();

  if (permission === 'unsupported') return null;
  if (permission === 'granted' && subscribed) {
    return (
      <div
        title="商談リマインド・実施報告をこの端末の通知で受け取ります"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 8,
          padding: collapsed ? '6px 0' : '5px 9px',
          fontSize: 11,
          color: 'var(--color-text-faint)',
        }}
      >
        <span>🔔</span>
        {!collapsed && <span>通知ON（この端末）</span>}
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
