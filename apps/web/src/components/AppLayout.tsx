import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useIsPhone } from '../lib/useIsPhone';
import { installNativeCopyLogger } from '../lib/copyLog';

// 文字を選んでのコピー(ブラウザ標準)も操作ログに残す(要望)
installNativeCopyLogger();
import { useRealtimeSync } from '../lib/useRealtimeSync';
import { useMe } from '../hooks/useApi';
import { NotificationMenu } from './NotificationMenu';
import { AccountBar } from './AccountBar';
import { TaskAlerts } from './TaskAlerts';
import { useChatUnread } from '../hooks/useChat';
import { OnlineUsersWidget } from './OnlineUsersWidget';
import { NavIcon, IconName } from './NavIcon';

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

type NavItem = { to: string; label: string; icon: IconName };
type NavGroup = { title?: string; items: NavItem[] };

const TOP_NAV: NavItem[] = [
  { to: '/summary', label: 'サマリー', icon: 'chart' },
  { to: '/chat', label: 'チャット', icon: 'chat' },
  { to: '/tasks', label: 'タスク', icon: 'task' },
  { to: '/memos', label: 'メモ', icon: 'memo' },
];
/** チャット・申込情報/明細は全員で使うため、役職ごとのタブ表示設定に関わらず常に表示する */
// 申込情報/明細も全員で共有して使う(要望: 他のアカウントからも見られるように)
const ALWAYS_VISIBLE = new Set(['/chat', '/application-sheets', '/tasks', '/memos']);

/** チャットの未読数バッジ */
function ChatUnreadBadge({ floating }: { floating?: boolean }) {
  const { data } = useChatUnread();
  const n = data?.total ?? 0;
  if (n <= 0) return null;
  return (
    <span className="chat-badge" style={floating ? { position: 'absolute', top: 3, right: 8 } : { marginLeft: 'auto' }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: '営業',
    items: [
      { to: '/toss/new', label: 'トス登録', icon: 'edit' },
      { to: '/toss-cases', label: 'トス実績管理', icon: 'inbox' },
      { to: '/appointments', label: 'アポ実績管理', icon: 'calendarCheck' },
      { to: '/contracts', label: 'エントリー管理', icon: 'document' },
      { to: '/deals', label: '案件管理', icon: 'folder' },
      { to: '/cl-calendar', label: 'CLカレンダー', icon: 'calendar' },
      { to: '/final-report', label: '最終報告', icon: 'clipboard' },
      { to: '/application-sheets', label: '申込情報/明細', icon: 'form' },
    ],
  },
];

const SHIFT_NAV_GROUP: NavGroup = {
  items: [{ to: '/shift', label: 'シフト', icon: 'calendar' }],
};

const ADMIN_NAV_GROUP: NavGroup = {
  title: '管理',
  items: [
    { to: '/admin/users', label: 'ユーザー管理', icon: 'user' },
    { to: '/admin/organizations', label: '組織管理', icon: 'building' },
    { to: '/admin/masters', label: 'マスタ管理', icon: 'sliders' },
    { to: '/admin/toss-form', label: 'トスフォーム設定', icon: 'form' },
    { to: '/admin/final-report-fields', label: '最終報告項目', icon: 'clipboard' },
    { to: '/admin/integrations', label: '連携設定', icon: 'link' },
    { to: '/admin/audit-logs', label: '操作ログ', icon: 'list' },
  ],
};

const COLLAPSE_STORAGE_KEY = 'nav.collapsed';

/** 携帯の下メニューは幅が狭いため短い呼び名にする */
const PHONE_LABELS: Record<string, string> = {
  '/toss-cases': 'トス実績',
  '/application-sheets': '申込/明細',
  '/appointments': 'アポ実績',
  '/contracts': 'エントリー',
  '/admin/users': 'ユーザー',
  '/admin/organizations': '組織',
  '/admin/masters': 'マスタ',
  '/admin/toss-form': 'トスフォーム',
  '/admin/final-report-fields': '報告項目',
  '/admin/integrations': '連携',
};

function PhoneTabLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      style={({ isActive }) => ({
        position: 'relative',
        flex: '0 0 auto',
        minWidth: 56,
        height: 52,
        padding: '7px 4px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        textDecoration: 'none',
        color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden
              style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--color-primary)' }}
            />
          )}
          <NavIcon name={item.icon} active={isActive} size={19} />
          <span style={{ fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{PHONE_LABELS[item.to] ?? item.label}</span>
          {item.to === '/chat' && <ChatUnreadBadge floating />}
        </>
      )}
    </NavLink>
  );
}

/**
 * 携帯の下メニュー(要望: 横スクロールで全タブを表示)。表示中のタブは自動で見える位置へスクロールする。
 * 設定系(管理)のタブは常時は出さず、右端の「設定」から開く(要望)。通知もスクロール領域の外(右端)に固定。
 */
function PhoneBottomNav({ items, adminItems, isManager }: { items: NavItem[]; adminItems: NavItem[]; isManager: boolean }) {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const onAdminPage = adminItems.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
    setAdminOpen(false);
  }, [pathname]);

  return (
    <>
      {adminOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setAdminOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="popover"
            style={{
              position: 'absolute',
              right: 8,
              bottom: 'calc(64px + env(safe-area-inset-bottom))',
              width: 'min(300px, calc(100vw - 16px))',
              padding: 8,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 4,
            }}
          >
            {adminItems.map((item) => (
              <PhoneTabLink key={item.to} item={item} />
            ))}
          </div>
        </div>
      )}
      <nav
        aria-label="タブ"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 300,
          display: 'flex',
          alignItems: 'stretch',
          background: 'var(--color-surface)',
          borderTop: '1px solid var(--color-border)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div ref={scrollRef} className="phone-nav-scroll" style={{ flex: 1, minWidth: 0, display: 'flex', overflowX: 'auto', padding: '0 4px' }}>
          {items.map((item) => (
            <PhoneTabLink key={item.to} item={item} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: '1px solid var(--color-border)' }}>
          {isManager && <NotificationMenu variant="tab" showReports />}
          {adminItems.length > 0 && (
            <button
              type="button"
              onClick={() => setAdminOpen((v) => !v)}
              aria-expanded={adminOpen}
              style={{
                position: 'relative',
                minWidth: 52,
                height: 52,
                padding: '7px 4px 0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                border: 'none',
                background: 'transparent',
                boxShadow: 'none',
                color: onAdminPage || adminOpen ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              {onAdminPage && (
                <span aria-hidden style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--color-primary)' }} />
              )}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d={adminOpen ? 'M6 6l12 12M18 6L6 18' : 'M12 5v14M5 12h14'} />
              </svg>
              <span style={{ fontSize: 9.5, fontWeight: 700 }}>設定</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

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
          {item.to === '/chat' && <ChatUnreadBadge floating={collapsed} />}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  useRealtimeSync();
  const isPhone = useIsPhone();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
  const { data: me } = useMe();
  const isManager = me ? me.roles.some((r) => MANAGER_ROLES.includes(r)) : false;
  const isAdmin = me ? me.roles.some((r) => ADMIN_ROLES.includes(r)) : false;
  const allGroups = isAdmin ? [...NAV_GROUPS, SHIFT_NAV_GROUP, ADMIN_NAV_GROUP] : [...NAV_GROUPS, SHIFT_NAV_GROUP];

  // 役職ごとのタブ表示設定(ユーザー管理)。visibleTabsがnullなら制限なし(全表示)。
  const visibleTabs = me?.visibleTabs ?? null;
  const isTabVisible = (to: string) => ALWAYS_VISIBLE.has(to) || !visibleTabs || visibleTabs.includes(to);
  const topNav = TOP_NAV.filter((i) => isTabVisible(i.to));
  const navGroups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => isTabVisible(i.to)) }))
    .filter((g) => g.items.length > 0);

  if (isPhone) {
    const phoneItems = [...topNav, ...navGroups.filter((g) => g.title !== ADMIN_NAV_GROUP.title).flatMap((g) => g.items)];
    const phoneAdminItems = navGroups.filter((g) => g.title === ADMIN_NAV_GROUP.title).flatMap((g) => g.items);
    return (
      <div style={{ minHeight: 'var(--viewport-height)' }}>
        <main style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
          <AccountBar />
          {children}
        </main>
        <TaskAlerts />
        <PhoneBottomNav items={phoneItems} adminItems={phoneAdminItems} isManager={isManager} />
      </div>
    );
  }

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <div style={{ display: 'flex', minHeight: 'var(--viewport-height)' }}>
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
          height: 'var(--viewport-height)',
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
              <img
                src="/icons/icon-512.png"
                alt="CH partners"
                width={26}
                height={26}
                style={{ flexShrink: 0, borderRadius: 7, boxShadow: '0 2px 6px rgba(44, 68, 180, 0.35)' }}
              />
              <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
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
          {topNav.map((item) => renderNavItem(item, collapsed))}
        </div>

        {navGroups.map((group) => (
          <div key={group.title ?? group.items[0]?.to} style={{ marginBottom: 14 }}>
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
          <OnlineUsersWidget collapsed={collapsed} />
          {isManager && <NotificationMenu variant="sidebar" collapsed={collapsed} showReports />}
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>
        <AccountBar />
        {children}
      </main>
      <TaskAlerts />
    </div>
  );
}
