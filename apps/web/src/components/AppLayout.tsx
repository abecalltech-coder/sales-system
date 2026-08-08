import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useRealtimeSync } from '../lib/useRealtimeSync';

const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    title: '営業',
    items: [
      { to: '/dashboard', label: 'ダッシュボード', icon: '📊' },
      { to: '/toss-cases', label: 'トス実績管理', icon: '📥' },
      { to: '/appointments', label: 'アポ実績管理', icon: '📅' },
      { to: '/visits', label: '訪問管理', icon: '🚗' },
      { to: '/contracts', label: '成約管理', icon: '📝' },
      { to: '/entries', label: 'エントリー管理', icon: '📄' },
    ],
  },
  {
    title: '分析',
    items: [
      { to: '/summary', label: 'サマリー', icon: '📈' },
      { to: '/calendar', label: 'カレンダー', icon: '🗓' },
      { to: '/customers', label: '顧客管理', icon: '🏢' },
    ],
  },
  {
    title: '管理',
    items: [
      { to: '/admin/users', label: 'ユーザー管理', icon: '👤' },
      { to: '/admin/organizations', label: '組織管理', icon: '🏗' },
      { to: '/admin/masters', label: 'マスタ管理', icon: '⚙️' },
      { to: '/admin/custom-fields', label: 'カスタム項目管理', icon: '🧩' },
      { to: '/admin/integrations', label: '連携設定', icon: '🔗' },
      { to: '/admin/audit-logs', label: '操作ログ', icon: '🧾' },
      { to: '/admin/system-settings', label: 'システム設定', icon: '🛠' },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  useRealtimeSync();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: 232,
          flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px 12px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ padding: '0 8px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'var(--color-primary)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            営
          </div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>営業案件管理</div>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--color-text-faint)',
                padding: '0 10px',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {group.title}
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                  background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                  fontWeight: isActive ? 700 : 500,
                  marginBottom: 2,
                })}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
