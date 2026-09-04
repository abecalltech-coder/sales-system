import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useRealtimeSync } from '../lib/useRealtimeSync';
import { useMe } from '../hooks/useApi';
import { NotificationBell } from './NotificationBell';
import { PushNotificationToggle } from './PushNotificationToggle';
import { NavIcon, IconName } from './NavIcon';

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

type NavItem = { to: string; label: string; icon: IconName };
type NavGroup = { title?: string; items: NavItem[] };

const TOP_NAV: NavItem[] = [{ to: '/summary', label: 'サマリー', icon: 'chart' }];

const NAV_GROUPS: NavGroup[] = [
  {
    title: '営業',
    items: [
      { to: '/toss/new', label: 'トス登録', icon: 'edit' },
      { to: '/toss-cases', label: 'トス実績管理', icon: 'inbox' },
      { to: '/appointments', label: 'アポ実績管理', icon: 'calendarCheck' },
      { to: '/contracts', label: 'エントリー管理', icon: 'document' },
      { to: '/cl-calendar', label: 'CLカレンダー', icon: 'calendar' },
    ],
  },
];

const ADMIN_NAV_GROUP: NavGroup = {
  title: '管理',
  items: [
    { to: '/admin/users', label: 'ユーザー管理', icon: 'user' },
    { to: '/admin/organizations', label: '組織管理', icon: 'building' },
    { to: '/admin/masters', label: 'マスタ管理', icon: 'sliders' },
    { to: '/admin/toss-form', label: 'トスフォーム設定', icon: 'form' },
    { to: '/admin/custom-fields', label: 'カスタム項目管理', icon: 'puzzle' },
    { to: '/admin/integrations', label: '連携設定', icon: 'link' },
    { to: '/admin/audit-logs', label: '操作ログ', icon: 'list' },
    { to: '/admin/system-settings', label: 'システム設定', icon: 'gear' },
  ],
};

const COLLAPSE_STORAGE_KEY = 'nav.collapsed';

function renderNavItem(item: NavItem, collapsed: boolean) {
  return (
    <NavLink
      key={item.to}
      to={item.to}
      title={collapsed ? item.label : undefined}
      style={({ isActive }) => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 9,
        padding: collapsed ? '7px 0' : '6px 9px',
        borderRadius: 7,
        fontSize: 12,
        textDecoration: 'none',
        color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
        background: isActive ? 'var(--color-primary-soft)' : 'transparent',
        fontWeight: isActive ? 700 : 500,
        marginBottom: 1,
        whiteSpace: 'nowrap',
        transition: 'background-color 0.12s ease, color 0.12s ease',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                left: -10,
                top: 6,
                bottom: 6,
                width: 3,
                borderRadius: 999,
                background: 'var(--color-primary)',
              }}
            />
          )}
          <NavIcon name={item.icon} active={isActive} />
          {!collapsed && item.label}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  useRealtimeSync();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
  const { data: me } = useMe();
  const isManager = me ? me.roles.some((r) => MANAGER_ROLES.includes(r)) : false;
  const isAdmin = me ? me.roles.some((r) => ADMIN_ROLES.includes(r)) : false;
  const navGroups = isAdmin ? [...NAV_GROUPS, ADMIN_NAV_GROUP] : NAV_GROUPS;

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
          width: collapsed ? 54 : 208,
          flexShrink: 0,
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: collapsed ? '14px 9px' : '14px 12px',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'width 0.16s ease, padding 0.16s ease',
        }}
      >
        <div
          style={{
            padding: collapsed ? 0 : '0 4px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            gap: 8,
          }}
        >
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <div
                style={{
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  borderRadius: 7,
                  background: 'linear-gradient(150deg, #4762e0 0%, #2c44b4 100%)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 10,
                  letterSpacing: '-0.02em',
                  boxShadow: '0 2px 6px rgba(44, 68, 180, 0.35)',
                }}
              >
                CH
              </div>
              <div style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                CH partners実績管理
              </div>
            </div>
          )}
          <button
            onClick={toggle}
            title={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            aria-label={collapsed ? 'サイドバーを開く' : 'サイドバーを閉じる'}
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
              color: 'var(--color-text-faint)',
              boxShadow: 'none',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-sunken)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          {TOP_NAV.map((item) => renderNavItem(item, collapsed))}
        </div>

        {navGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: 14 }}>
            {!collapsed && group.title && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--color-text-faint)',
                  padding: '0 9px',
                  marginBottom: 5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  whiteSpace: 'nowrap',
                }}
              >
                {group.title}
              </div>
            )}
            {group.items.map((item) => renderNavItem(item, collapsed))}
          </div>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          <PushNotificationToggle collapsed={collapsed} />
          {isManager && <NotificationBell collapsed={collapsed} />}
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
