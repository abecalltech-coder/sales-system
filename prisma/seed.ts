import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const RESOURCES = [
  'toss_case',
  'appointment',
  'visit',
  'contract',
  'entry',
  'customer',
  'user',
  'master',
  'system',
] as const;

// 初期ロール定義。ADMIN/SUPER_ADMINはPermissionsGuard側で全許可扱いのため、
// ここでは代表的な非管理者ロールにのみ具体的な権限を付与する。
const ROLE_DEFS: { code: string; name: string; permissions: { resource: string; action: string; scope: string }[] }[] = [
  { code: 'SUPER_ADMIN', name: 'システム管理者', permissions: [] },
  { code: 'ADMIN', name: '業務管理者', permissions: [] },
  {
    code: 'MANAGER',
    name: '部署責任者',
    permissions: RESOURCES.filter((r) => r !== 'system').flatMap((resource) => [
      { resource, action: 'view', scope: 'DEPT' },
      { resource, action: 'edit', scope: 'DEPT' },
    ]),
  },
  {
    code: 'LEADER',
    name: 'チームリーダー',
    permissions: ['toss_case', 'appointment', 'visit', 'contract', 'entry', 'customer'].flatMap(
      (resource) => [
        { resource, action: 'view', scope: 'TEAM' },
        { resource, action: 'edit', scope: 'TEAM' },
      ],
    ),
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
    code: 'ENTRY_OPERATOR',
    name: 'エントリー担当',
    permissions: ['contract', 'entry'].flatMap((resource) => [
      { resource, action: 'view', scope: 'ALL' },
      { resource, action: 'edit', scope: 'ALL' },
    ]),
  },
  {
    code: 'USER',
    name: '一般ユーザー',
    permissions: ['toss_case', 'appointment', 'visit', 'contract', 'entry', 'customer'].flatMap(
      (resource) => [{ resource, action: 'view', scope: 'TEAM' }],
    ),
  },
  { code: 'VIEWER', name: '閲覧専用', permissions: RESOURCES.map((r) => ({ resource: r, action: 'view', scope: 'ALL' })) },
];

const STATUS_DEFS: { category: string; internalCode: string; displayName: string; color?: string }[] = [
  // トス
  { category: 'TOSS', internalCode: 'TOSS_NEW', displayName: '新規', color: '#3b82f6' },
  { category: 'TOSS', internalCode: 'TOSS_UNHANDLED', displayName: '未対応', color: '#f97316' },
  { category: 'TOSS', internalCode: 'TOSS_IN_PROGRESS', displayName: '対応中', color: '#eab308' },
  { category: 'TOSS', internalCode: 'TOSS_ABSENT', displayName: '不在', color: '#a3a3a3' },
  { category: 'TOSS', internalCode: 'TOSS_RECALL', displayName: '再架電', color: '#a3a3a3' },
  { category: 'TOSS', internalCode: 'TOSS_PROSPECT', displayName: '見込み', color: '#22c55e' },
  { category: 'TOSS', internalCode: 'TOSS_APPOINTMENT', displayName: 'アポイント', color: '#16a34a' },
  { category: 'TOSS', internalCode: 'TOSS_CANCELLED', displayName: 'キャンセル', color: '#ef4444' },
  { category: 'TOSS', internalCode: 'TOSS_EXCLUDED', displayName: '対象外', color: '#737373' },
  { category: 'TOSS', internalCode: 'TOSS_DUPLICATE', displayName: '重複', color: '#737373' },
  { category: 'TOSS', internalCode: 'TOSS_CLOSED', displayName: 'クローズ', color: '#737373' },
  // アポ(商談ステータス)
  { category: 'APPOINTMENT', internalCode: 'APO_CONFIRMED', displayName: 'アポ確定', color: '#3b82f6' },
  { category: 'APPOINTMENT', internalCode: 'APO_BEFORE_MEETING', displayName: '商談前', color: '#eab308' },
  { category: 'APPOINTMENT', internalCode: 'APO_IN_MEETING', displayName: '商談中', color: '#f97316' },
  { category: 'APPOINTMENT', internalCode: 'APO_MEETING_DONE', displayName: '商談完了', color: '#22c55e' },
  { category: 'APPOINTMENT', internalCode: 'APO_RESCHEDULE', displayName: '再商談', color: '#a3a3a3' },
  { category: 'APPOINTMENT', internalCode: 'APO_REVISIT', displayName: '再訪問', color: '#a3a3a3' },
  { category: 'APPOINTMENT', internalCode: 'APO_CONTRACTED', displayName: '成約', color: '#16a34a' },
  { category: 'APPOINTMENT', internalCode: 'APO_ON_HOLD', displayName: '保留', color: '#a3a3a3' },
  { category: 'APPOINTMENT', internalCode: 'APO_CANCELLED', displayName: 'キャンセル', color: '#ef4444' },
  { category: 'APPOINTMENT', internalCode: 'APO_NO_CONTACT', displayName: '不通', color: '#737373' },
  { category: 'APPOINTMENT', internalCode: 'APO_LOST', displayName: '失注', color: '#ef4444' },
  { category: 'APPOINTMENT', internalCode: 'APO_EXCLUDED', displayName: '対象外', color: '#737373' },
  // 訪問
  { category: 'VISIT', internalCode: 'VISIT_SCHEDULED', displayName: '訪問予定', color: '#3b82f6' },
  { category: 'VISIT', internalCode: 'VISIT_DEPARTED', displayName: '出発', color: '#eab308' },
  { category: 'VISIT', internalCode: 'VISIT_IN_TRANSIT', displayName: '移動中', color: '#eab308' },
  { category: 'VISIT', internalCode: 'VISIT_ARRIVED', displayName: '訪問到着', color: '#22c55e' },
  { category: 'VISIT', internalCode: 'MEETING_IN_PROGRESS', displayName: '商談中', color: '#f97316' },
  { category: 'VISIT', internalCode: 'MEETING_COMPLETED', displayName: '商談終了', color: '#16a34a' },
  { category: 'VISIT', internalCode: 'VISIT_ABSENT', displayName: '不在', color: '#a3a3a3' },
  { category: 'VISIT', internalCode: 'VISIT_DELAYED', displayName: '遅刻', color: '#f97316' },
  { category: 'VISIT', internalCode: 'VISIT_CANCELLED', displayName: 'キャンセル', color: '#ef4444' },
  { category: 'VISIT', internalCode: 'REVISIT_REQUIRED', displayName: '再訪問', color: '#a3a3a3' },
  { category: 'VISIT', internalCode: 'VISIT_COMPLETED', displayName: '完了', color: '#16a34a' },
  // マッチング
  { category: 'MATCHING', internalCode: 'NOT_HANDLED', displayName: '未対応', color: '#a3a3a3' },
  { category: 'MATCHING', internalCode: 'ERROR', displayName: 'エラー', color: '#ef4444' },
  { category: 'MATCHING', internalCode: 'FACTOR_COLLECTING', displayName: 'ファクター回収中', color: '#eab308' },
  { category: 'MATCHING', internalCode: 'SMS_APPROVAL_PENDING', displayName: 'SMS承認待ち', color: '#eab308' },
  { category: 'MATCHING', internalCode: 'POST_CONFIRM_PENDING', displayName: '後確待ち', color: '#eab308' },
  { category: 'MATCHING', internalCode: 'MATCHING_COMPLETED', displayName: 'マッチング完了', color: '#22c55e' },
  { category: 'MATCHING', internalCode: 'SWITCHING_PENDING', displayName: 'スイッチング待ち', color: '#3b82f6' },
  { category: 'MATCHING', internalCode: 'SWITCHING_COMPLETED', displayName: 'スイッチング完了', color: '#16a34a' },
  { category: 'MATCHING', internalCode: 'CANCELLED', displayName: 'キャンセル', color: '#ef4444' },
  // エントリー
  { category: 'ENTRY', internalCode: 'NOT_ENTERED', displayName: '未エントリー', color: '#a3a3a3' },
  { category: 'ENTRY', internalCode: 'PREPARING', displayName: 'エントリー準備中', color: '#eab308' },
  { category: 'ENTRY', internalCode: 'DEFICIENCY_CHECKING', displayName: '不備確認中', color: '#f97316' },
  { category: 'ENTRY', internalCode: 'ENTERED', displayName: 'エントリー済み', color: '#22c55e' },
  { category: 'ENTRY', internalCode: 'RETURNED', displayName: '差戻し', color: '#ef4444' },
  { category: 'ENTRY', internalCode: 'RESUBMITTED', displayName: '再提出', color: '#eab308' },
  { category: 'ENTRY', internalCode: 'APPROVED', displayName: '承認済み', color: '#16a34a' },
  { category: 'ENTRY', internalCode: 'REJECTED', displayName: '却下', color: '#ef4444' },
  { category: 'ENTRY', internalCode: 'ENTRY_CANCELLED', displayName: 'キャンセル', color: '#ef4444' },
  // トス実績: 進捗(前確架電の結果)
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_PRE_CONFIRM_OK', displayName: '前確OK', color: '#16a34a' },
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_NG', displayName: 'NG', color: '#ef4444' },
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_ABSENT', displayName: '不在', color: '#a3a3a3' },
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_FOLLOWING', displayName: '追い中', color: '#eab308' },
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_RETURNED', displayName: '返却', color: '#737373' },
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_CALLBACK_WAIT', displayName: '折り返し待ち', color: '#3b82f6' },
  { category: 'TOSS_PROGRESS', internalCode: 'PROGRESS_EMAIL_IN_PROGRESS', displayName: 'メール対応中', color: '#3b82f6' },
  // トス実績: NG理由
  { category: 'TOSS_NG_REASON', internalCode: 'NG_NO_AUTHORITY', displayName: '決済権無しNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_SWITCHING', displayName: '切り替えNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_ACQUAINTANCE', displayName: '知り合いNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_HASSLE', displayName: '面倒NG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_INDOOR_VIEW', displayName: 'インドアビューNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_CHANGED_MIND', displayName: '気変わりNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_THIRD_PARTY', displayName: '第三者介入', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_OPENING', displayName: '冒頭NG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_CANCELLATION_FEE', displayName: '解約金NG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_EXISTING_CONTRACT', displayName: '対象外(既契約)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_BUILDING_MANAGEMENT', displayName: '対象外(建物管理)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_HEAD_OFFICE_MANAGEMENT', displayName: '対象外(本社管理)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_FOREIGNER', displayName: '対象外(外国人)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_ELDERLY', displayName: '対象外(高齢)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_PRICE_NOT_MET', displayName: '対象外(料金未達)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_HIGH_VOLTAGE', displayName: '対象外(高圧)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_EXCLUDED_ALL_ELECTRIC_SOLAR', displayName: '対象外(オール電化・太陽光等)', color: '#737373' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_RECENTLY_SWITCHED', displayName: '切り替えたばかりNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_TOO_BUSY', displayName: '忙しくて時間取れないNG', color: '#ef4444' },
  { category: 'TOSS_NG_REASON', internalCode: 'NG_HOMEPAGE', displayName: 'ホームページNG', color: '#ef4444' },
];

async function main() {
  console.log('シード投入を開始します...');

  for (const [i, def] of STATUS_DEFS.entries()) {
    await prisma.statusMaster.upsert({
      where: { category_internalCode: { category: def.category, internalCode: def.internalCode } },
      update: { displayName: def.displayName, color: def.color },
      create: { ...def, order: i },
    });
  }
  console.log(`ステータスマスタ${STATUS_DEFS.length}件を投入しました`);

  for (const def of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      update: { name: def.name },
      create: { code: def.code, name: def.name },
    });
    for (const p of def.permissions) {
      await prisma.permission.upsert({
        where: { roleId_resource_action: { roleId: role.id, resource: p.resource, action: p.action } },
        update: { scope: p.scope },
        create: { roleId: role.id, resource: p.resource, action: p.action, scope: p.scope },
      });
    }
  }
  console.log(`ロール${ROLE_DEFS.length}件を投入しました`);

  const company = await prisma.company.upsert({
    where: { id: 'seed-default-company' },
    update: {},
    create: { id: 'seed-default-company', name: '株式会社Calltech' },
  });

  const department = await prisma.department.upsert({
    where: { id: 'seed-default-department' },
    update: {},
    create: { id: 'seed-default-department', companyId: company.id, name: '営業部', order: 1 },
  });

  const team = await prisma.team.upsert({
    where: { id: 'seed-default-team' },
    update: {},
    create: { id: 'seed-default-team', departmentId: department.id, name: '第一営業チーム', order: 1 },
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_INITIAL_PASSWORD ?? 'ChangeMe123!';
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });

  // 既に管理者アカウントが存在する場合、誰も一度もログイン(初回パスワード変更)していない
  // 間だけADMIN_INITIAL_PASSWORDでパスワードを再設定できるようにする。これによりseed再実行時に
  // 「最初の実行時のパスワードのまま変わらない」事象を防ぎつつ、実際にログインして
  // パスワードを変更済みの管理者を誤って上書きしないようにする。
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update:
      existingAdmin && existingAdmin.mustChangePassword
        ? { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null }
        : {},
    create: {
      email: adminEmail,
      name: 'システム管理者',
      passwordHash,
      mustChangePassword: true,
      departmentId: department.id,
      teamId: team.id,
      roles: { create: [{ roleId: superAdminRole.id }] },
    },
  });
  console.log(`初期管理者: ${admin.email} (初回ログイン時パスワード変更が必要です)`);

  const sampleProducts = ['エネパル電気(低圧)', 'エネパル電気(高圧)', 'ガスセット'];
  for (const [i, name] of sampleProducts.entries()) {
    await prisma.product.upsert({
      where: { id: `seed-product-${i}` },
      update: { name },
      create: { id: `seed-product-${i}`, name, order: i },
    });
  }
  const sampleSources = ['Googleフォーム', '紹介', '架電'];
  for (const [i, name] of sampleSources.entries()) {
    await prisma.source.upsert({
      where: { id: `seed-source-${i}` },
      update: { name },
      create: { id: `seed-source-${i}`, name, order: i },
    });
  }
  console.log('サンプル商材・流入元を投入しました(本番では実データに置き換えてください)');

  console.log('シード投入が完了しました');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
