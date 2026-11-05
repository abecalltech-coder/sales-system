import { BadRequestException } from '@nestjs/common';
import { PersonalStatsService } from './personal-stats.module';
import { AuthenticatedUser } from '../auth/types';

const viewer = { id: 'me', roles: ['CL'], permissions: [], departmentId: 'd1', teamId: null } as unknown as AuthenticatedUser;
const NOW = new Date('2026-11-05T03:00:00Z'); // JST 11/5 12:00

/** 個人別数値の入力ルール(要望): 全ての入力は誰でも、実績は今日まで、着地見込みは未来日だけ、月初予算は月末まで */
describe('PersonalStatsService の入力ルール', () => {
  beforeEach(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  const setup = () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'other', name: 'AP太郎', departmentId: 'd2', teamId: null, roles: [{ role: { code: 'AP', name: 'AP' } }] }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      personalDailyStat: { create: jest.fn().mockResolvedValue({ value: 3, version: 1 }), findMany: jest.fn().mockResolvedValue([]) },
      personalStatTarget: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ weeklyStory: 1, monthlyGoal: null, version: 1 }),
      },
      departmentStoryValue: { create: jest.fn().mockResolvedValue({ value: 1, version: 1 }) },
      statusMaster: { findMany: jest.fn().mockResolvedValue([]) },
      tossCase: { findMany: jest.fn().mockResolvedValue([]) },
      appointment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const realtime = { emitToAll: jest.fn() };
    return { prisma, service: new PersonalStatsService(prisma as never, realtime as never) };
  };
  const daily = (date: string, metricKey: string) => ({ userId: 'other', date, metricKey, value: 3, version: null });

  it('誰でも他の人の実績を今日まで入力できる', async () => {
    const { prisma, service } = setup();
    await expect(service.saveDaily(viewer, daily('2026-11-05', 'TOSS_UP'))).resolves.toEqual({ value: 3, version: 1 });
    await expect(service.saveDaily(viewer, daily('2026-11-01', 'APPOINTMENT'))).resolves.toEqual({ value: 3, version: 1 });
    expect(prisma.personalDailyStat.create.mock.calls[0][0].data).toMatchObject({ userId: 'other', updatedBy: 'me' });
  });

  it('実績は未来日に入力できない', async () => {
    const { prisma, service } = setup();
    await expect(service.saveDaily(viewer, daily('2026-11-06', 'TOSS_UP'))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.personalDailyStat.create).not.toHaveBeenCalled();
  });

  it('着地見込みは未来日だけ入力でき、今日までは入力できない', async () => {
    const { service } = setup();
    await expect(service.saveDaily(viewer, daily('2026-11-06', 'TOSS_UP_REVISED'))).resolves.toEqual({ value: 3, version: 1 });
    await expect(service.saveDaily(viewer, daily('2026-11-05', 'TOSS_UP_REVISED'))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('月初予算は過去日も未来日も入力できる', async () => {
    const { service } = setup();
    await expect(service.saveDaily(viewer, daily('2026-11-30', 'TOSS_UP_BUDGET'))).resolves.toEqual({ value: 3, version: 1 });
    await expect(service.saveDaily(viewer, daily('2026-11-01', 'APPOINTMENT_BUDGET'))).resolves.toEqual({ value: 3, version: 1 });
  });

  it('週目標と他部署の部署ストーリーも誰でも入力できる', async () => {
    const { service } = setup();
    await expect(service.saveTarget(viewer, { userId: 'other', month: '2026-11', metricKey: 'TOSS_UP', weeklyStory: 1, version: null })).resolves.toMatchObject({ weeklyStory: 1 });
    await expect(service.saveStory(viewer, { departmentId: 'd9', month: '2026-11', cell: 'm:TOSS_UP', value: 1, version: null })).resolves.toEqual({ value: 1, version: 1 });
  });

  it('システム上の実績は未来日には出さない', async () => {
    const { prisma, service } = setup();
    prisma.tossCase.findMany.mockResolvedValue([
      { receivedAt: new Date('2026-11-04T03:00:00Z'), apStaffName: 'AP太郎', tossUserId: null, progressStatusId: null },
      { receivedAt: new Date('2026-11-07T03:00:00Z'), apStaffName: 'AP太郎', tossUserId: null, progressStatusId: null },
    ]);
    const sheet = await service.sheet('other', '2026-11');
    expect(sheet.auto['2026-11-04']).toEqual({ TOSS_UP: 1 });
    expect(sheet.auto['2026-11-07']).toBeUndefined();
  });

  it('人員の一覧は見る人の範囲で絞らない', async () => {
    const { prisma, service } = setup();
    await service.users();
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.id).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });
});
