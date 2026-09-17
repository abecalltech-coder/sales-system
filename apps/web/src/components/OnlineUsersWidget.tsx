import { useState } from 'react';
import { useOnlineUsers } from '../lib/useOnlineUsers';
import { useMe } from '../hooks/useApi';

/**
 * 現在ログイン中(アプリを開いている)のアカウント一覧(要望)。
 * NotificationBell等と同じ、サイドバー下部のポップオーバー方式。
 */
export function OnlineUsersWidget({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const users = useOnlineUsers();
  const { data: me } = useMe();
  const count = users.length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="ログイン中のアカウント"
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
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: count > 0 ? 'var(--color-success)' : 'var(--color-text-faint)',
            flexShrink: 0,
          }}
        />
        {!collapsed && <span>ログイン中{count > 0 ? `(${count})` : ''}</span>}
      </button>

      {open && (
        <div
          className="popover"
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 6,
            width: 240,
            maxHeight: 320,
            overflowY: 'auto',
            zIndex: 500,
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 700 }}>
            ログイン中のアカウント({count})
          </div>
          {count === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>誰もログインしていません</div>
          ) : (
            users
              .slice()
              .sort((a, b) => a.userName.localeCompare(b.userName, 'ja'))
              .map((u) => (
                <div
                  key={u.userId}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', fontSize: 12 }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-success)', flexShrink: 0 }} />
                  {u.userName}
                  {u.userId === me?.id && <span style={{ color: 'var(--color-text-faint)' }}>(自分)</span>}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
