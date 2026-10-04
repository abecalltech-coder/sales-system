import { RolesService } from './roles.service';
import { ROLE_DEFS } from './role-defs';

function prismaWith(existing: { id: string; code: string; name: string; permissions: { id: string; resource: string; action: string; scope: string }[] }[]) {
  return {
    role: {
      findMany: jest.fn().mockResolvedValue(existing),
      create: jest.fn(({ data }) => Promise.resolve({ id: `new-${data.code}`, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    permission: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

describe('ロール定義の同期', () => {
  it('起動を待たせない(onModuleInit は同期処理の完了を待たずに戻る)', () => {
    const prisma = prismaWith([]);
    prisma.role.findMany = jest.fn(() => new Promise(() => undefined)); // DBが止まっていても
    const service = new RolesService(prisma as never);
    expect(service.onModuleInit()).toBeUndefined();
  });

  it('DBが定義どおりなら書き込みは0件', async () => {
    const existing = ROLE_DEFS.map((d, i) => ({
      id: `r${i}`,
      code: d.code,
      name: d.name,
      permissions: d.permissions.map((p, j) => ({ id: `p${i}-${j}`, ...p })),
    }));
    const prisma = prismaWith(existing);
    await new RolesService(prisma as never).syncRoleDefs();
    expect(prisma.role.create).not.toHaveBeenCalled();
    expect(prisma.role.update).not.toHaveBeenCalled();
    expect(prisma.permission.createMany).not.toHaveBeenCalled();
    expect(prisma.permission.update).not.toHaveBeenCalled();
  });

  it('無い役職は作成、名前・範囲の違いだけ更新', async () => {
    const [first, ...rest] = ROLE_DEFS;
    const existing = rest.map((d, i) => ({
      id: `r${i}`,
      code: d.code,
      name: i === 0 ? '旧名' : d.name,
      permissions: d.permissions.map((p, j) => ({ id: `p${i}-${j}`, ...p, scope: i === 0 && j === 0 ? 'OWN_OLD' : p.scope })),
    }));
    const prisma = prismaWith(existing);
    await new RolesService(prisma as never).syncRoleDefs();
    expect(prisma.role.create).toHaveBeenCalledTimes(1);
    expect(prisma.role.create.mock.calls[0][0].data.code).toBe(first.code);
    expect(prisma.permission.createMany).toHaveBeenCalledTimes(first.permissions.length ? 1 : 0);
    expect(prisma.role.update).toHaveBeenCalledTimes(1);
    expect(prisma.permission.update).toHaveBeenCalledTimes(rest[0].permissions.length ? 1 : 0);
  });
});
