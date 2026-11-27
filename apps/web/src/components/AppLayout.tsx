import { ReactNode, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useIsPhone } from '../lib/useIsPhone';
import { installNativeCopyLogger } from '../lib/copyLog';

// 文字を選んでのコピー(ブラウザ標準)も操作ログに残す(要望)
installNativeCopyLogger();
import { useRealtimeSync } from '../lib/useRealtimeSync';
import { useMe } from '../hooks/useApi';
import { useTasks } from '../lib/tasks';
import { rememberLastPath } from '../lib/navTabs';
import { NotificationMenu } from './NotificationMenu';
import { AccountBar } from './AccountBar';
import { useChatUnread } from '../hooks/useChat';
import { OnlineUsersWidget } from './OnlineUsersWidget';
import { RemoteCursors } from './RemoteCursors';
import { NavIcon, IconName } from './NavIcon';

const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

type NavItem = { to: string; label: string; icon: IconName };
type NavGroup = { title?: string; items: NavItem[] };

/** 大ジャンル(要望: タブを営業 / 顧客管理 / 数値管理にまとめる)。中のタブは役職ごとのタブ表示設定で出し入れする */
type NavGenre = { key: string; title: string; icon: IconName; items: NavItem[] };
const NAV_GENRES: NavGenre[] = [
  {
    key: 'sales',
    title: '営業',
    icon: 'flag',
    items: [
      { to: '/talk-scripts', label: 'トークスクリプト', icon: 'script' },
      { to: '/toss/new', label: 'トス登録', icon: 'edit' },
      { to: '/appointments/new', label: 'アポ登録', icon: 'edit' },
      { to: '/toss-cases', label: 'トス実績', icon: 'inbox' },
      { to: '/appointments', label: 'アポ実績', icon: 'calendarCheck' },
      { to: '/contracts', label: 'ET実績', icon: 'document' },
      { to: '/close-reports', label: 'クローズ結果報告', icon: 'flag' },
      { to: '/cl-calendar', label: 'CLカレンダー', icon: 'calendar' },
      { to: '/application-sheets', label: '申込情報/明細', icon: 'form' },
    ],
  },
  {
    key: 'customers',
    title: '顧客管理',
    icon: 'folder',
    items: [
      { to: '/deals', label: '案件管理', icon: 'folder' },
      { to: '/cb-cases', label: 'CB管理', icon: 'yen' },
    ],
  },
  {
    key: 'numbers',
    title: '数値管理',
    icon: 'chart',
    items: [
      { to: '/summary', label: '役割別数値', icon: 'chart' },
      { to: '/personal-stats', label: '個人別数値', icon: 'grid' },
      { to: '/story', label: 'ストーリー', icon: 'chart' },
      { to: '/dept-metrics', label: '部署別数値', icon: 'grid' },
    ],
  },
];

/** 一番上に固定するタスク(要望: スマホは今の通知タブの場所) */
const TASKS_NAV: NavItem = { to: '/tasks', label: 'タスク', icon: 'task' };
/** ジャンルに入れず独立して並べるタブ(要望: チャット・メモ・稼働ルール) */
const STANDALONE_NAV: NavItem[] = [
  { to: '/chat', label: 'チャット', icon: 'chat' },
  { to: '/memos', label: 'メモ', icon: 'memo' },
  { to: '/work-rules', label: '稼働ルール', icon: 'book' },
];

const ADMIN_NAV_GROUP: NavGroup = {
  title: '管理',
  items: [
    { to: '/admin/users', label: 'ユーザー管理', icon: 'user' },
    { to: '/admin/organizations', label: '組織管理', icon: 'building' },
    { to: '/admin/masters', label: 'マスタ管理', icon: 'sliders' },
    { to: '/admin/toss-form', label: 'トスフォーム設定', icon: 'form' },
    { to: '/admin/apo-form', label: 'アポフォーム設定', icon: 'form' },
    { to: '/admin/integrations', label: '連携設定', icon: 'link' },
    { to: '/admin/audit-logs', label: '操作ログ', icon: 'list' },
  ],
};

const COLLAPSE_STORAGE_KEY = 'nav.collapsed';
const OPEN_GENRES_KEY = 'nav.openGenres';

/** チャット等は全員で使うため、役職ごとのタブ表示設定に関わらず常に表示する */
// 申込情報/明細は役職ごとのタブ表示で出し入れする(要望: 見える権限を役職ごとに設定)
// 稼働ルールは全員が閲覧できる(要望。編集はユーザー管理の役職ごとの設定)
const ALWAYS_VISIBLE = new Set(['/chat', '/tasks', '/memos', '/work-rules']);

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

/** 携帯の下メニューは幅が狭いため短い呼び名にする */
const PHONE_LABELS: Record<string, string> = {
  '/toss-cases': 'トス実績',
  '/application-sheets': '申込/明細',
  '/appointments': 'アポ実績',
  '/contracts': 'ET実績',
  '/admin/users': 'ユーザー',
  '/admin/organizations': '組織',
  '/admin/masters': 'マスタ',
  '/admin/toss-form': 'トスフォーム',
  '/admin/apo-form': 'アポフォーム',
  '/admin/integrations': '連携',
};

function PhoneTabLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      // アポ登録(/appointments/new)を開いているときにアポ実績管理まで選択中にしない
      end={item.to === '/appointments'}
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
          {item.to === '/tasks' && <TaskOverdueBadge floating />}
        </>
      )}
    </NavLink>
  );
}


/** タスクの未対応の数(期日を過ぎた未完了)。タスクタブに赤いバッジで出す(要望) */
function TaskOverdueBadge({ floating }: { floating?: boolean }) {
  const { data } = useTasks(false);
  const n = (data ?? []).filter((t) => t.overdue && !t.doneByViewer).length;
  if (n <= 0) return null;
  return (
    <span className="chat-badge" style={floating ? { position: 'absolute', top: 3, right: 8 } : { marginLeft: 'auto' }}>
      {n > 99 ? '99+' : n}
    </span>
  );
}

const pathIn = (pathname: string, items: NavItem[]) => items.some((i) => pathname === i.to || pathname.startsWith(`${i.to}/`));

/** 携帯のジャンル中のタブを出すシート用のリンク(文字は小さめ) */
function SheetLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/appointments'}
      style={({ isActive }) => ({
        minHeight: 38,
        padding: '4px 6px',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        textDecoration: 'none',
        fontSize: 10.5,
        fontWeight: 700,
        lineHeight: 1.25,
        color: isActive ? 'var(--color-primary)' : 'var(--color-text)',
        background: isActive ? 'var(--color-primary-soft)' : 'var(--color-sunken)',
      })}
    >
      {PHONE_LABELS[item.to] ?? item.label}
    </NavLink>
  );
}

/** 携帯の下メニューのジャンルのボタン。押すと中のタブがシートで出る */
function PhoneGenreButton({ title, icon, active, open, onClick }: { title: string; icon: IconName; active: boolean; open: boolean; onClick: () => void }) {
  const on = active || open;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        minWidth: 58,
        height: 52,
        padding: '7px 4px 0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        border: 'none',
        background: 'transparent',
        boxShadow: 'none',
        color: on ? 'var(--color-primary)' : 'var(--color-text-muted)',
      }}
    >
      {active && (
        <span aria-hidden style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--color-primary)' }} />
      )}
      <NavIcon name={icon} active={on} size={19} />
      <span style={{ fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-0.02em' }}>{title}</span>
    </button>
  );
}

/**
 * 携帯の下メニュー(要望): ジャンル(営業 / 顧客管理 / 数値管理)とチャット・メモ・稼働ルールを横に並べ、
 * 右端に「タスク」を固定(今の通知タブの場所。通知の設定は上のアイコンから)。
 * ジャンルを押すと中のタブが下からシートで出る。管理者は右端の「設定」から管理のタブを開く。
 */
function PhoneBottomNav({ genres, standalone, adminItems }: { genres: NavGenre[]; standalone: NavItem[]; adminItems: NavItem[] }) {
  const { pathname } = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const onAdminPage = pathIn(pathname, adminItems);
  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[aria-current="page"], [data-genre-active="1"]');
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
    setSheet(null);
  }, [pathname]);
  const sheetGenre = genres.find((g) => g.key === sheet);
  const sheetItems = sheet === 'admin' ? adminItems : (sheetGenre?.items ?? []);

  return (
    <>
      {sheet && sheetItems.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(20, 26, 40, 0.28)' }} onClick={() => setSheet(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="popover"
            style={{
              position: 'absolute',
              left: 10,
              right: 10,
              bottom: 'calc(72px + env(safe-area-inset-bottom))',
              padding: 12,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 6 }}>
              {sheet === 'admin' ? '設定' : sheetGenre?.title}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {sheetItems.map((item) => (
                <SheetLink key={item.to} item={item} />
              ))}
            </div>
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
          {genres.map((g) => {
            const active = pathIn(pathname, g.items);
            return (
              <span key={g.key} data-genre-active={active ? '1' : undefined} style={{ display: 'flex', flex: '0 0 auto' }}>
                <PhoneGenreButton title={g.title} icon={g.icon} active={active} open={sheet === g.key} onClick={() => setSheet((v) => (v === g.key ? null : g.key))} />
              </span>
            );
          })}
          {standalone.map((item) => (
            <PhoneTabLink key={item.to} item={item} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: '1px solid var(--color-border)' }}>
          <PhoneTabLink item={TASKS_NAV} />
          {adminItems.length > 0 && (
            <button
              type="button"
              onClick={() => setSheet((v) => (v === 'admin' ? null : 'admin'))}
              aria-expanded={sheet === 'admin'}
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
                color: onAdminPage || sheet === 'admin' ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              {onAdminPage && (
                <span aria-hidden style={{ position: 'absolute', top: 0, left: 12, right: 12, height: 3, borderRadius: '0 0 3px 3px', background: 'var(--color-primary)' }} />
              )}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d={sheet === 'admin' ? 'M6 6l12 12M18 6L6 18' : 'M12 5v14M5 12h14'} />
              </svg>
              <span style={{ fontSize: 9.5, fontWeight: 700 }}>設定</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function renderNavItem(item: NavItem, collapsed: boolean, compact = false) {
  return (
    <NavLink
      key={item.to}
      to={item.to}
      // アポ登録(/appointments/new)を開いているときにアポ実績管理まで選択中にしない
      end={item.to === '/appointments'}
      title={collapsed ? item.label : undefined}
      style={({ isActive }) => ({
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 9,
        padding: collapsed ? '7px 0' : compact ? '4px 8px' : '6px 9px',
        borderRadius: 7,
        fontSize: compact ? 11 : 12,
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
          {item.to === '/tasks' && <TaskOverdueBadge floating={collapsed} />}
        </>
      )}
    </NavLink>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  useRealtimeSync();
  const isPhone = useIsPhone();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1');
  const { data: me } = useMe();
  const isManager = me ? me.roles.some((r) => MANAGER_ROLES.includes(r)) : false;
  const isAdmin = me ? me.roles.some((r) => ADMIN_ROLES.includes(r)) : false;

  // 役職ごとのタブ表示設定(ユーザー管理)。visibleTabsがnullなら制限なし(全表示)。
  const visibleTabs = me?.visibleTabs ?? null;
  const isTabVisible = (to: string) => ALWAYS_VISIBLE.has(to) || !visibleTabs || visibleTabs.includes(to);
  // 中のタブが全部非表示のジャンルは出さない
  const genres = NAV_GENRES.map((g) => ({ ...g, items: g.items.filter((i) => isTabVisible(i.to)) })).filter((g) => g.items.length > 0);
  const standalone = STANDALONE_NAV.filter((i) => isTabVisible(i.to));
  const adminItems = isAdmin ? ADMIN_NAV_GROUP.items.filter((i) => isTabVisible(i.to)) : [];

  // 開いているジャンル(PC)。今の画面のジャンルは自動で開く
  const [openGenres, setOpenGenres] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OPEN_GENRES_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const cur = NAV_GENRES.find((g) => pathIn(pathname, g.items));
    if (cur) setOpenGenres((v) => (v.includes(cur.key) ? v : [...v, cur.key]));
  }, [pathname]);
  useEffect(() => {
    try {
      localStorage.setItem(OPEN_GENRES_KEY, JSON.stringify(openGenres));
    } catch {
      /* 保存できない端末では毎回閉じた状態から */
    }
  }, [openGenres]);
  // 今開いている画面を覚える(要望: アプリを開いたとき、前回開いていた画面を最初に出す)
  useEffect(() => {
    rememberLastPath(pathname);
  }, [pathname]);

  if (isPhone) {
    return (
      <div style={{ minHeight: 'var(--viewport-height)' }}>
        <main style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
          <AccountBar />
          {children}
        </main>
        <PhoneBottomNav genres={genres} standalone={standalone} adminItems={adminItems} />
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
  const toggleGenre = (key: string) => setOpenGenres((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  const sectionTitle = (t: string) => (
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
      {t}
    </div>
  );

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
                alt="CH system"
                width={26}
                height={26}
                style={{ flexShrink: 0, borderRadius: 7, boxShadow: '0 2px 6px rgba(44, 68, 180, 0.35)' }}
              />
              <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
                CH system
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

        {/* 一番上に固定: タスク */}
        <div style={{ marginBottom: 8 }}>{renderNavItem(TASKS_NAV, collapsed)}</div>

        {/* 大ジャンル(押すと中のタブが開閉する) */}
        {genres.map((g) => {
          const isOpen = openGenres.includes(g.key);
          const hasActive = pathIn(pathname, g.items);
          if (collapsed) {
            return (
              <div key={g.key} style={{ marginBottom: 8, paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
                {g.items.map((item) => renderNavItem(item, true))}
              </div>
            );
          }
          return (
            <div key={g.key} style={{ marginBottom: 6 }}>
              <button
                type="button"
                onClick={() => toggleGenre(g.key)}
                aria-expanded={isOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '6px 9px',
                  border: 'none',
                  borderRadius: 7,
                  background: 'transparent',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  color: hasActive ? 'var(--color-primary)' : 'var(--color-text)',
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                }}
              >
                <NavIcon name={g.icon} active={hasActive} />
                <span style={{ flex: 1 }}>{g.title}</span>
                <span aria-hidden style={{ color: 'var(--color-text-faint)', fontSize: 12 }}>
                  {isOpen ? '⌄' : '›'}
                </span>
              </button>
              {isOpen && (
                <div style={{ margin: '1px 0 2px 17px', paddingLeft: 8, borderLeft: `2px solid ${hasActive ? 'var(--color-primary)' : 'var(--color-border)'}` }}>
                  {g.items.map((item) => renderNavItem(item, false, true))}
                </div>
              )}
            </div>
          );
        })}

        {/* ジャンルに入れず独立して並べるタブ */}
        {standalone.length > 0 && (
          <div style={{ margin: '8px 0 14px', paddingTop: 8, borderTop: collapsed ? undefined : '1px solid var(--color-border)' }}>
            {standalone.map((item) => renderNavItem(item, collapsed))}
          </div>
        )}

        {adminItems.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            {!collapsed && sectionTitle(ADMIN_NAV_GROUP.title ?? '管理')}
            {adminItems.map((item) => renderNavItem(item, collapsed))}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          <OnlineUsersWidget collapsed={collapsed} />
          {isManager && <NotificationMenu variant="sidebar" collapsed={collapsed} showReports />}
        </div>
      </nav>
      <main style={{ flex: 1, minWidth: 0 }}>
        <AccountBar />
        {children}
      </main>
      <RemoteCursors />
    </div>
  );
}
