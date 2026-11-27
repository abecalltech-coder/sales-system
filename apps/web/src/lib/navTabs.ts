/**
 * サイドナビの全タブ一覧(役職ごとのタブ表示設定で使う「唯一の正」)。
 * key はそのままルートパス(AppLayoutのNAV_GROUPS等のtoと一致させる)。
 */
export interface NavTabDef {
  key: string;
  label: string;
  group: string;
}

export const ALL_NAV_TABS: NavTabDef[] = [
  { key: '/talk-scripts', label: 'トークスクリプト', group: '営業' },
  { key: '/toss/new', label: 'トス登録', group: '営業' },
  { key: '/appointments/new', label: 'アポ登録', group: '営業' },
  { key: '/toss-cases', label: 'トス実績', group: '営業' },
  { key: '/appointments', label: 'アポ実績', group: '営業' },
  { key: '/contracts', label: 'ET実績', group: '営業' },
  { key: '/close-reports', label: 'クローズ結果報告', group: '営業' },
  { key: '/cl-calendar', label: 'CLカレンダー', group: '営業' },
  { key: '/application-sheets', label: '申込情報/明細', group: '営業' },
  { key: '/deals', label: '案件管理', group: '顧客管理' },
  { key: '/cb-cases', label: 'CB管理', group: '顧客管理' },
  { key: '/summary', label: '役割別数値', group: '数値管理' },
  { key: '/personal-stats', label: '個人別数値', group: '数値管理' },
  { key: '/story', label: 'ストーリー', group: '数値管理' },
  { key: '/dept-metrics', label: '部署数値', group: '数値管理' },
  { key: '/admin/users', label: 'ユーザー管理', group: '管理' },
  { key: '/admin/organizations', label: '組織管理', group: '管理' },
  { key: '/admin/masters', label: 'マスタ管理', group: '管理' },
  { key: '/admin/toss-form', label: 'トスフォーム設定', group: '管理' },
  { key: '/admin/apo-form', label: 'アポフォーム設定', group: '管理' },
  { key: '/admin/integrations', label: '連携設定', group: '管理' },
  { key: '/admin/audit-logs', label: '操作ログ', group: '管理' },
];

/** 役職のタブ表示設定(visibleTabs)で開いてよいか。null は制限なし。一覧に無い画面(チャット等)は常に可 */
export function isNavTabAllowed(path: string, visibleTabs: string[] | null | undefined): boolean {
  if (!visibleTabs) return true;
  if (!ALL_NAV_TABS.some((t) => t.key === path)) return true;
  return visibleTabs.includes(path);
}

/** 一覧に無くても最初に開いてよい画面(全員が使うタブ) */
const FREE_PATHS = ['/tasks', '/chat', '/memos', '/work-rules'];
const LAST_PATH_KEY = 'nav.lastPath';

/** 今開いている画面を覚える(要望: アプリを開いたとき、前回開いていた画面を最初に出す) */
export function rememberLastPath(pathname: string): void {
  const top = pathname.startsWith('/chat') ? '/chat' : pathname;
  if (!ALL_NAV_TABS.some((t) => t.key === top) && !FREE_PATHS.includes(top)) return;
  if (top.startsWith('/admin/')) return;
  try {
    localStorage.setItem(LAST_PATH_KEY, top);
  } catch {
    /* 保存できない端末ではタスクから始める */
  }
}

/**
 * ログイン直後・「/」で開く画面(要望: 前回開いていた画面、無ければタスクに統一)。
 * 前回の画面が今の役職のタブ表示で見られないときもタスク(タスクは全員が見られる)
 */
export function landingPath(visibleTabs: string[] | null | undefined): string {
  try {
    const last = localStorage.getItem(LAST_PATH_KEY);
    if (last && (FREE_PATHS.includes(last) || ALL_NAV_TABS.some((t) => t.key === last)) && isNavTabAllowed(last, visibleTabs)) return last;
  } catch {
    /* 読めない端末はタスク */
  }
  return '/tasks';
}
