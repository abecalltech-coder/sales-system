import { of, lastValueFrom } from 'rxjs';
import { AuditTrailInterceptor } from './audit-trail.interceptor';

const TOSS_ID = '11111111-1111-4111-8111-111111111111';
const STATUS_OLD = '22222222-2222-4222-8222-222222222222';
const STATUS_NEW = '33333333-3333-4333-8333-333333333333';
const USER_ID = '44444444-4444-4444-8444-444444444444';

function makePrisma() {
  const created: unknown[] = [];
  const empty = { findMany: jest.fn().mockResolvedValue([]) };
  return {
    created,
    tossCase: {
      findUnique: jest.fn().mockResolvedValue({
        id: TOSS_ID,
        caseNumber: 'T-0001',
        caseName: null,
        memo: '旧メモ',
        progressStatusId: STATUS_OLD,
        customer: { corporateName: '旧店舗' },
      }),
    },
    statusMaster: {
      findMany: jest.fn().mockResolvedValue([
        { id: STATUS_OLD, displayName: '未対応' },
        { id: STATUS_NEW, displayName: '対応済' },
      ]),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: USER_ID, name: '山田' }]) },
    department: empty,
    team: empty,
    product: empty,
    source: empty,
    dealFieldOption: empty,
    finalReportField: empty,
    auditLog: { create: jest.fn((args: unknown) => (created.push(args), Promise.resolve(args))) },
  };
}

function ctx(req: Record<string, unknown>) {
  return { getType: () => 'http', switchToHttp: () => ({ getRequest: () => req }) } as never;
}

describe('AuditTrailInterceptor', () => {
  it('タブ・対象・項目ごとの変更前→変更後を記録する', async () => {
    const prisma = makePrisma();
    const interceptor = new AuditTrailInterceptor(prisma as never);
    const req = {
      method: 'PATCH',
      originalUrl: `/api/toss-cases/${TOSS_ID}`,
      user: { id: USER_ID },
      headers: { 'x-page-path': encodeURIComponent('/toss-cases') },
      body: { version: 3, memo: '新メモ', progressStatusId: STATUS_NEW, corporateName: '旧店舗' },
    };
    const obs = await interceptor.intercept(ctx(req), { handle: () => of({ ok: true }) });
    await lastValueFrom(obs);
    await new Promise((r) => setImmediate(r));

    const data = (prisma.created[0] as { data: Record<string, unknown> }).data;
    expect(data.action).toBe('toss-cases.update');
    expect(data.success).toBe(true);
    expect(data.after).toEqual({
      page: '/toss-cases',
      op: '更新',
      target: 'T-0001 旧店舗',
      changes: [
        { label: '備考', before: '旧メモ', after: '新メモ' },
        { label: '進捗', before: '未対応', after: '対応済' },
      ],
    });
  });

  it('パスワードは記録しない', async () => {
    const prisma = makePrisma();
    (prisma as unknown as { user: Record<string, unknown> }).user.findUnique = jest
      .fn()
      .mockResolvedValue({ id: USER_ID, name: '山田', passwordHash: 'x' });
    const interceptor = new AuditTrailInterceptor(prisma as never);
    const req = {
      method: 'POST',
      originalUrl: `/api/users/${USER_ID}/set-password`,
      user: { id: USER_ID },
      headers: {},
      body: { newPassword: 'secret-pass' },
    };
    await lastValueFrom(await interceptor.intercept(ctx(req), { handle: () => of({ ok: true }) }));
    await new Promise((r) => setImmediate(r));

    const data = (prisma.created[0] as { data: Record<string, unknown> }).data;
    expect(JSON.stringify(data)).not.toContain('secret-pass');
    expect((data.after as { op: string }).op).toBe('パスワード変更');
  });
});
