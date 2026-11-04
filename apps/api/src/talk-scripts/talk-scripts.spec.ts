import { ForbiddenException } from '@nestjs/common';
import { TalkScriptsService } from './talk-scripts.module';
import { AuthenticatedUser } from '../auth/types';

const userOf = (roles: string[]) => ({ id: 'u1', roles, visibleTabs: null }) as unknown as AuthenticatedUser;

/** 閲覧はタブが見える人全員、編集は役職の設定で許可した人と管理者だけ(要望) */
describe('TalkScriptsService', () => {
  const setup = (allowed: boolean) => {
    const prisma = {
      role: { count: jest.fn().mockResolvedValue(allowed ? 1 : 0) },
      talkStep: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: 2 } }),
        create: jest.fn(async ({ data }) => data),
      },
      talkOut: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'o1' }),
        update: jest.fn(async ({ data }) => data),
        aggregate: jest.fn().mockResolvedValue({ _max: { order: null } }),
        create: jest.fn(async ({ data }) => data),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ talkRank: 'SILVER' }) },
    };
    const realtime = { emitToAll: jest.fn() };
    return { prisma, realtime, service: new TalkScriptsService(prisma as never, realtime as never) };
  };

  it('権限が無くても閲覧でき、自分のランクと編集可否が返る', async () => {
    const { service } = setup(false);
    await expect(service.list(userOf(['AP']))).resolves.toMatchObject({ canEdit: false, myRank: 'SILVER' });
  });

  it('権限が無い役職は作成・更新できない', async () => {
    const { prisma, service } = setup(false);
    await expect(service.createStep({ rank: 'GOLD' }, userOf(['AP']))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateOut('o1', { body: 'x' }, userOf(['AP']))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.talkStep.create).not.toHaveBeenCalled();
    expect(prisma.talkOut.update).not.toHaveBeenCalled();
  });

  it('管理者は役職の設定に関係なく編集でき、新しいトークは最後に並ぶ', async () => {
    const { prisma, service, realtime } = setup(false);
    const created = await service.createStep({ rank: 'GOLD', name: ' 導入 ' }, userOf(['SUPER_ADMIN']));
    expect(created).toMatchObject({ rank: 'GOLD', name: '導入', order: 3 });
    expect(prisma.role.count).not.toHaveBeenCalled();
    expect(realtime.emitToAll).toHaveBeenCalledWith('talk-scripts.updated', {});
  });

  it('アウトの使うランクは重複を除いて保存する(他のランクへの流用)', async () => {
    const { service } = setup(true);
    const created = await service.createOut({ ranks: ['BRONZE', 'SILVER', 'BRONZE'], label: '今忙しい' }, userOf(['AP_LEADER']));
    expect(created).toMatchObject({ ranks: ['BRONZE', 'SILVER'], order: 0 });
    const updated = await service.updateOut('o1', { ranks: ['GOLD', 'GOLD'] }, userOf(['AP_LEADER']));
    expect(updated).toMatchObject({ ranks: ['GOLD'] });
  });
});
