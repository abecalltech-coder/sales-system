import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useRealtimeSync } from '../lib/useRealtimeSync';

const NAV_GROUPS: { title: string; items: { to: string; label: string; icon: string }[] }[] = [
  {
    title: '営業',
    items: [
      { to: '/dashboard', label: 'ダッシュボード', icon: '📊' },
      { to: '/toss-cases', label: 'トス実績管理', icon: '📥' },
      { to: '/appointments', label: 'アポ実績管理', icon: '📅' },
      { to: '/contracts', label: 'エントリー管理', icon: '📄' },
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

const COLLAPSE_STORAGE_KEY = 'nav.collapsed';

export function AppLayout({ children }: { children: ReactNode }) {
  useRealtimeSync();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav
        style={{
          width: collapsed ? 56 : 232,
          flexShrink: 0,
          background: '#fff',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: collapsed ? '20px 8px' : '20px 12px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width 0.15s ease, padding 0.15s ease',
        }}
      >
        <div
          style={{
            padding: collapsed ? 0 : '0 8px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 8,
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
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
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>営業案件管理</div>
            </div>
          )}
          <button
            onClick={toggle}
            title={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            aria-label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              background: 'var(--color-surface)',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        {NAV_GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 18 }}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--color-text-faint)',
                  padding: '0 10px',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                {group.title}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  padding: collapsed ? '8px 0' : '8px 10px',
                  borderRadius: 8,
                  fontSize: 13,
                  textDecoration: 'none',
                  color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
                  background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                  fontWeight: isActive ? 700 : 500,
                  marginBottom: 2,
                  whiteSpace: 'nowrap',
                })}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
