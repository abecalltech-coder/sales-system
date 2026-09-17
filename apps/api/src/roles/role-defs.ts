// ロール/権限の初期定義(唯一の正)。prisma/seed.ts とAPI起動時のブートストラップ
// (roles.service.ts の onModuleInit)の両方からこれを参照する。

export const RESOURCES = [
  'toss_case',
  'appointment',
  'visit',
  'contract',
  'deal',
  'customer',
  'user',
  'master',
  'system',
] as const;

export interface RoleDef {
  code: string;
  name: string;
  permissions: { resource: string; action: string; scope: string }[];
}

// ADMIN/SUPER_ADMINはPermissionsGuard側で全許可扱いのため、
// ここでは代表的な非管理者ロールにのみ具体的な権限を付与する。
export const ROLE_DEFS: RoleDef[] = [
  { code: 'SUPER_ADMIN', name: 'システム管理者', permissions: [] },
  { code: 'ADMIN', name: '業務管理者', permissions: [] },
  {
    code: 'MANAGER',
    name: '部署責任者',
    permissions: [
      ...RESOURCES.filter((r) => r !== 'system').flatMap((resource) => [
        { resource, action: 'view', scope: 'DEPT' },
        { resource, action: 'edit', scope: 'DEPT' },
      ]),
      // 案件管理(契約中案件の進捗管理)は部署責任者が行を追加・削除できるようにする
      { resource: 'deal', action: 'create', scope: 'DEPT' },
      { resource: 'deal', action: 'delete', scope: 'DEPT' },
    ],
  },
  {
    code: 'LEADER',
    name: 'チームリーダー',
    permissions: ['toss_case', 'appointment', 'visit', 'contract', 'deal', 'customer'].flatMap((resource) => [
      { resource, action: 'view', scope: 'TEAM' },
      { resource, action: 'edit', scope: 'TEAM' },
    ]),
  },
  {
    code: 'INSIDE_SALES',
    name: 'トス・アポ担当',
    permissions: ['toss_case', 'appointment', 'customer'].flatMap((resource) => [
      { resource, action: 'view', scope: 'OWN' },
      { resource, action: 'edit', scope: 'OWN' },
      { resource, action: 'create', scope: 'OWN' },
    ]),
  },
  {
    code: 'FIELD_SALES',
    name: '訪問営業',
    permissions: ['visit', 'appointment'].flatMap((resource) => [
      { resource, action: 'view', scope: 'OWN' },
      { resource, action: 'edit', scope: 'OWN' },
    ]),
  },
  {
    // エントリー管理(旧ET管理、Contractデータがそのまま実体)の担当ロール
    code: 'ENTRY_OPERATOR',
    name: 'エントリー担当',
    permissions: [
      ...['contract'].flatMap((resource) => [
        { resource, action: 'view', scope: 'ALL' },
        { resource, action: 'edit', scope: 'ALL' },
      ]),
      // 案件管理(契約中案件の進捗管理)も同じ担当が行を追加・削除できるようにする
      { resource: 'deal', action: 'view', scope: 'ALL' },
      { resource: 'deal', action: 'edit', scope: 'ALL' },
      { resource: 'deal', action: 'create', scope: 'ALL' },
      { resource: 'deal', action: 'delete', scope: 'ALL' },
    ],
  },
  {
    code: 'USER',
    name: '一般ユーザー',
    permissions: ['toss_case', 'appointment', 'visit', 'contract', 'deal', 'customer'].flatMap((resource) => [
      { resource, action: 'view', scope: 'TEAM' },
    ]),
  },
  { code: 'VIEWER', name: '閲覧専用', permissions: RESOURCES.map((r) => ({ resource: r, action: 'view', scope: 'ALL' })) },
  // 役職(要望: 各アカウントに必ず役職を付与し、役職ごとに表示タブをユーザー管理で設定できるようにする)。
  // 権限(閲覧/編集の範囲)は既存ロールと同じ仕組みで持たせつつ、表示タブはRole.visibleTabsで別途管理する。
  {
    code: 'AP',
    name: 'AP',
    permissions: ['toss_case', 'appointment', 'customer'].flatMap((resource) => [
      { resource, action: 'view', scope: 'OWN' },
      { resource, action: 'edit', scope: 'OWN' },
      { resource, action: 'create', scope: 'OWN' },
    ]),
  },
  {
    code: 'AP_LEADER',
    name: 'APリーダー',
    permissions: ['toss_case', 'appointment', 'visit', 'contract', 'deal', 'customer'].flatMap((resource) => [
      { resource, action: 'view', scope: 'TEAM' },
      { resource, action: 'edit', scope: 'TEAM' },
    ]),
  },
  {
    code: 'CL',
    name: 'CL',
    permissions: [
      ...['appointment', 'deal', 'customer'].flatMap((resource) => [
        { resource, action: 'view', scope: 'TEAM' },
        { resource, action: 'edit', scope: 'TEAM' },
      ]),
      { resource: 'contract', action: 'view', scope: 'ALL' },
      { resource: 'contract', action: 'edit', scope: 'ALL' },
    ],
  },
  {
    code: 'RESPONSIBLE',
    name: '責任者',
    permissions: [
      ...RESOURCES.filter((r) => r !== 'system').flatMap((resource) => [
        { resource, action: 'view', scope: 'DEPT' },
        { resource, action: 'edit', scope: 'DEPT' },
      ]),
      { resource: 'deal', action: 'create', scope: 'DEPT' },
      { resource: 'deal', action: 'delete', scope: 'DEPT' },
    ],
  },
];
