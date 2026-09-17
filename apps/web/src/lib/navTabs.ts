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
  { key: '/toss-cases', label: 'トス実績管理', group: '営業' },
  { key: '/appointments', label: 'アポ実績管理', group: '営業' },
  { key: '/contracts', label: 'エントリー管理', group: '営業' },
  { key: '/deals', label: '案件管理', group: '営業' },
  { key: '/cl-calendar', label: 'CLカレンダー', group: '営業' },
  { key: '/final-report', label: '最終報告', group: '営業' },
  { key: '/shift', label: 'シフト', group: 'トップ' },
  { key: '/admin/users', label: 'ユーザー管理', group: '管理' },
  { key: '/admin/organizations', label: '組織管理', group: '管理' },
  { key: '/admin/masters', label: 'マスタ管理', group: '管理' },
  { key: '/admin/toss-form', label: 'トスフォーム設定', group: '管理' },
  { key: '/admin/final-report-fields', label: '最終報告項目', group: '管理' },
  { key: '/admin/custom-fields', label: 'カスタム項目管理', group: '管理' },
  { key: '/admin/integrations', label: '連携設定', group: '管理' },
  { key: '/admin/audit-logs', label: '操作ログ', group: '管理' },
  { key: '/admin/system-settings', label: 'システム設定', group: '管理' },
];
