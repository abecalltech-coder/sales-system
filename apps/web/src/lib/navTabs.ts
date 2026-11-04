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
  { key: '/summary', label: 'サマリー', group: 'トップ' },
  { key: '/toss/new', label: 'トス登録', group: '営業' },
  { key: '/appointments/new', label: 'アポ登録', group: '営業' },
  { key: '/toss-cases', label: 'トス実績管理', group: '営業' },
  { key: '/appointments', label: 'アポ実績管理', group: '営業' },
  { key: '/contracts', label: 'エントリー管理', group: '営業' },
  { key: '/deals', label: '案件管理', group: '営業' },
  { key: '/cl-calendar', label: 'CLカレンダー', group: '営業' },
  { key: '/final-report', label: '最終報告', group: '営業' },
  { key: '/close-reports', label: 'クローズ報告', group: '営業' },
  { key: '/cb-cases', label: 'CB管理', group: '営業' },
  { key: '/talk-scripts', label: 'トークスクリプト', group: '営業' },
  { key: '/application-sheets', label: '申込情報/明細', group: '営業' },
  { key: '/personal-stats', label: '個人別数値', group: 'トップ' },
  { key: '/admin/users', label: 'ユーザー管理', group: '管理' },
  { key: '/admin/organizations', label: '組織管理', group: '管理' },
  { key: '/admin/masters', label: 'マスタ管理', group: '管理' },
  { key: '/admin/toss-form', label: 'トスフォーム設定', group: '管理' },
  { key: '/admin/apo-form', label: 'アポフォーム設定', group: '管理' },
  { key: '/admin/final-report-fields', label: '最終報告項目', group: '管理' },
  { key: '/admin/integrations', label: '連携設定', group: '管理' },
  { key: '/admin/audit-logs', label: '操作ログ', group: '管理' },
];

/** 役職のタブ表示設定(visibleTabs)で開いてよいか。null は制限なし。一覧に無い画面(チャット等)は常に可 */
export function isNavTabAllowed(path: string, visibleTabs: string[] | null | undefined): boolean {
  if (!visibleTabs) return true;
  if (!ALL_NAV_TABS.some((t) => t.key === path)) return true;
  return visibleTabs.includes(path);
}

/**
 * ログイン直後・「/」で開く画面(要望: タブを付けていない役職がトス実績を見られないように)。
 * 従来どおりトス実績管理が見られる人はそこ、見られない人は表示できる最初のタブ、何も無ければタスク
 */
export function landingPath(visibleTabs: string[] | null | undefined): string {
  if (isNavTabAllowed('/toss-cases', visibleTabs)) return '/toss-cases';
  return ALL_NAV_TABS.find((t) => !t.key.startsWith('/admin/') && visibleTabs?.includes(t.key))?.key ?? '/tasks';
}
