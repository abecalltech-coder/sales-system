import { ForbiddenException } from '@nestjs/common';
import { TalkScriptsService, cleanRich } from './talk-scripts.module';
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

  it('アウト返しは選んだベーストークの項目ごとに別々に作る(重複は除く・ランクは項目のもの)', async () => {
    const { prisma, service } = setup(true);
    prisma.talkStep.findMany.mockResolvedValue([
      { id: 's1', rank: 'BRONZE' },
      { id: 's2', rank: 'SILVER' },
    ]);
    (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops));
    const created = (await service.createOut({ stepIds: ['s1', 's2', 's1'], label: ' 今忙しい ', body: '返し' }, userOf(['AP_LEADER']))) as unknown as {
      stepId: string;
      ranks: string[];
      label: string;
    }[];
    expect(created).toHaveLength(2);
    expect(created.map((c) => [c.stepId, c.ranks, c.label])).toEqual([
      ['s1', ['BRONZE'], '今忙しい'],
      ['s2', ['SILVER'], '今忙しい'],
    ]);
  });

  it('存在しない項目を選んだら作らない', async () => {
    const { prisma, service } = setup(true);
    prisma.talkStep.findMany.mockResolvedValue([{ id: 's1', rank: 'BRONZE' }]);
    await expect(service.createOut({ stepIds: ['s1', 'gone'] }, userOf(['AP_LEADER']))).rejects.toThrow('見つかりません');
    expect(prisma.talkOut.create).not.toHaveBeenCalled();
  });

  describe('文字色・塗りつぶし(cleanRich)', () => {
    it('同じ色の続きはまとめ、#rrggbb 以外の色は外す', () => {
      expect(
        cleanRich([
          { t: 'あ', c: '#D23B3B' },
          { t: 'い', c: '#d23b3b' },
          { t: 'う', c: 'red', b: 'url(x)' },
          { t: '', c: '#000000' },
        ]),
      ).toEqual([{ t: 'あい', c: '#d23b3b' }, { t: 'う' }]);
    });
    it('色が1つも無ければ null(プレーンの文字として扱う)', () => {
      expect(cleanRich([{ t: 'あ' }, { t: 'い' }])).toBeNull();
      expect(cleanRich(null)).toBeNull();
    });
    it('形がおかしい・長すぎるものは受け付けない', () => {
      expect(() => cleanRich('x')).toThrow();
      expect(() => cleanRich([{ c: '#ffffff' }])).toThrow();
      expect(() => cleanRich([{ t: 'a'.repeat(101), c: '#ffffff' }], 100)).toThrow('長すぎ');
    });
  });
});
