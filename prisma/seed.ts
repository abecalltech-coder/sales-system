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

async function main() {
  console.log('シード投入を開始します...');

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

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
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
