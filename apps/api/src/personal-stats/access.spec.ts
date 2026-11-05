import { ForbiddenException } from '@nestjs/common';
import { PersonalStatsService } from './personal-stats.module';
import { AuthenticatedUser } from '../auth/types';

const viewer = { id: 'me', roles: ['CL'], permissions: [], departmentId: 'd1', teamId: null } as unknown as AuthenticatedUser;

/** 営業系の役職の人のシートは誰でも変更できる(要望) */
describe('PersonalStatsService の権限', () => {
  const setup = (targetRole: string) => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'other', departmentId: 'd2', teamId: null, roles: [{ role: { code: targetRole, name: targetRole } }] }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      personalDailyStat: { create: jest.fn().mockResolvedValue({ value: 3, version: 1 }) },
    };
    const realtime = { emitToAll: jest.fn() };
    return { prisma, service: new PersonalStatsService(prisma as never, realtime as never) };
  };
  const dto = { userId: 'other', date: '2026-11-01', metricKey: 'TOSS_UP', value: 3, version: null };

  it('権限の無い役職でも、他部署のAPの数字を変更できる', async () => {
    const { prisma, service } = setup('AP');
    await expect(service.saveDaily(viewer, dto)).resolves.toEqual({ value: 3, version: 1 });
    expect(prisma.personalDailyStat.create.mock.calls[0][0].data).toMatchObject({ userId: 'other', updatedBy: 'me' });
  });

  it('APリーダーの数字も変更できる', async () => {
    const { service } = setup('AP_LEADER');
    await expect(service.saveDaily(viewer, dto)).resolves.toEqual({ value: 3, version: 1 });
  });

  it('営業系でない役職の人のシートは今までどおり範囲外なら変更できない', async () => {
    const { prisma, service } = setup('CL');
    await expect(service.saveDaily(viewer, dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.personalDailyStat.create).not.toHaveBeenCalled();
  });

  it('人員の一覧は見る人の範囲で絞らない', async () => {
    const { prisma, service } = setup('AP');
    await service.users();
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });
});
