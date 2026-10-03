import { Test } from '@nestjs/testing';
import { DepartmentSummaryModule } from './department-summary.module';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

const S = (id: string, category: string, internalCode: string, displayName: string) => ({ id, category, internalCode, displayName, active: true, order: 0 });

function prismaMock() {
  return {
    department: { findMany: jest.fn().mockResolvedValue([{ id: 'd1', name: 'CT', order: 1 }]) },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u-ap', name: '山田 太郎', departmentId: 'd1', roles: [{ role: { code: 'AP' } }] },
        { id: 'u-cl', name: '佐藤花子', departmentId: 'd1', roles: [{ role: { code: 'CL' } }] },
      ]),
    },
    statusMaster: {
      findMany: jest.fn().mockResolvedValue([
        S('tp-apo', 'TOSS_PROGRESS', 'PROGRESS_PRE_CONFIRM_OK', '前確OK'),
        S('tp-old', 'TOSS_PROGRESS', 'PROGRESS_APPOINTMENT', 'アポイント'),
        S('tp-ng', 'TOSS_PROGRESS', 'PROGRESS_NG', 'NG'),
        S('ap-et', 'APPOINTMENT_PROGRESS', 'PROG_ET', 'ET'),
        S('ap-cancel', 'APPOINTMENT_PROGRESS', 'PROG_CANCELLED', 'キャンセル'),
        S('ap-resche', 'APPOINTMENT_PROGRESS', 'PROG_RESCHEDULE', 'リスケ'),
        S('ap-zenren', 'APPOINTMENT_PROGRESS', 'x_custom', '前連失注'),
        S('ms-done', 'APPOINTMENT', 'APO_MEETING_DONE', '商談完了'),
        S('ms-before', 'APPOINTMENT', 'APO_BEFORE_MEETING', '商談前'),
        S('cl-sato', 'APPOINTMENT_CLOSER', 'c1', '佐藤 花子'),
      ]),
    },
    monthlyShiftRow: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'u-ap', days: { '2026-10-01': 8, '2026-10-02': 7.5, '2026-09-30': 8 } }]),
    },
    finalReportField: { findMany: jest.fn().mockResolvedValue([{ id: 'f-sf' }, { id: 'f-blank' }]) },
    finalReportEntry: { findMany: jest.fn().mockResolvedValue([{ userId: 'u-ap', values: { 'f-sf': 100, 'f-blank': 24, other: 999 } }]) },
    tossCase: {
      findMany: jest.fn().mockResolvedValue([
        { id: 't1', apStaffName: '山田太郎', progressStatusId: 'tp-apo' },
        { id: 't2', apStaffName: '山田　太郎', progressStatusId: 'tp-apo' },
        { id: 't3', apStaffName: '山田太郎', progressStatusId: 'tp-ng' },
        // 旧「アポイント」は数えない
        { id: 't4', apStaffName: '山田太郎', progressStatusId: 'tp-old' },
      ]),
    },
    appointment: {
      findMany: jest.fn().mockResolvedValue([
        { tossCaseId: 't1', apStaffName: '山田太郎', closerStatusId: 'cl-sato', progressStatusId: 'ap-et', meetingStatusId: 'ms-done', anshinBizPoints: 3 },
        { tossCaseId: 't2', apStaffName: '山田太郎', closerStatusId: 'cl-sato', progressStatusId: 'ap-cancel', meetingStatusId: 'ms-before', anshinBizPoints: null },
        { tossCaseId: null, apStaffName: '別の人', closerStatusId: 'cl-sato', progressStatusId: 'ap-zenren', meetingStatusId: 'ms-before', anshinBizPoints: 2 },
      ]),
    },
    summaryBudget: { findMany: jest.fn().mockResolvedValue([{ userId: 'u-ap', values: { tossUp: '30' } }]) },
  };
}

describe('部署別サマリー', () => {
  it('合意した定義どおりに集計する', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DepartmentSummaryModule] })
      .useMocker((token) => {
        if (token === PrismaService) return prismaMock();
        if (token === RealtimeService) return { emitToAll: jest.fn() };
        return undefined;
      })
      .compile();
    // コントローラーはモジュール内のクラスのため、モジュールのメタデータから取り出す
    const [Ctrl] = Reflect.getMetadata('controllers', DepartmentSummaryModule) as (new (...a: never[]) => unknown)[];
    const controller = moduleRef.get(Ctrl) as { get: (p: string) => Promise<{ departments: { rows: Record<string, unknown>[] }[] }> };
    const res = await controller.get('2026-10');
    const [ap, cl] = res.departments[0].rows;

    // AP: トスもアポも「AP」欄で本人分(空白・全角の違いは無視)
    expect(ap).toMatchObject({
      workHours: 15.5, // 対象月の日だけ
      calls: 124, // SF + 白地
      tossCount: 4,
      preOk: 2,
      validPreOk: 1, // t2 はアポがキャンセル
      meetingDone: 1,
      et: 1,
      reschedule: 0,
      zenrenLost: 0,
      remainingVisit: 1,
      points: 3,
      budget: { tossUp: '30' },
    });
    // CL: アポは「CL」欄が本人の案件(3件)
    expect(cl).toMatchObject({ tossCount: 0, preOk: 0, meetingDone: 1, et: 1, zenrenLost: 1, remainingVisit: 2, points: 5 });
  });
});
