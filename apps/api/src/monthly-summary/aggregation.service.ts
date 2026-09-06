import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { periodMonthRange } from '../common/utils/period.util';
import { AutoMetrics, MEETING_DONE_CHECKPOINTS, RESCHEDULE_CHECKPOINT } from './aggregation.constants';

const EMPTY: AutoMetrics = { tossUp: 0, apo: 0, meetingDone: 0, contractSites: 0, etCount: 0, reschedule: 0 };

@Injectable()
export class SummaryAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 対象月 × 各ユーザーの自動集計値を返す。userId をキーにしたマップ。
   * periodMonth はレコード作成時に確定した「運用上の月」で絞る(日付ではなく)。
   */
  async computeForUsers(period: string, userIds: string[]): Promise<Record<string, AutoMetrics>> {
    const result: Record<string, AutoMetrics> = {};
    for (const id of userIds) result[id] = { ...EMPTY };
    if (userIds.length === 0) return result;

    const { start, end } = periodMonthRange(period);
    const meetingRange = { gte: start, lt: end };

    const [tossUp, apo, contract, meetingDone, reschedule] = await Promise.all([
      // トスアップ = トス案件数(tossUserId)
      this.prisma.tossCase.groupBy({
        by: ['tossUserId'],
        where: { deletedAt: null, periodMonth: period, tossUserId: { in: userIds } },
        _count: { _all: true },
      }),
      // アポ = アポ詳細数(apoUserId)
      this.prisma.appointment.groupBy({
        by: ['apoUserId'],
        where: { deletedAt: null, periodMonth: period, apoUserId: { in: userIds } },
        _count: { _all: true },
      }),
      // 成約拠点数 = エントリー案件数(contractUserId)。ET数 = うち電子契約完了。
      this.prisma.contract.findMany({
        where: { deletedAt: null, periodMonth: period, contractUserId: { in: userIds } },
        select: { contractUserId: true, appointment: { select: { electronicContractAt: true } } },
      }),
      // 商談実施数 = 商談結果(訪問/オンライン)の実施報告があるアポ詳細
      this.prisma.appointmentReportEvent.findMany({
        where: {
          checkpoint: { in: [...MEETING_DONE_CHECKPOINTS] },
          appointment: { deletedAt: null, periodMonth: period, apoUserId: { in: userIds } },
          reportedAt: meetingRange,
        },
        select: { appointmentId: true, appointment: { select: { apoUserId: true } } },
      }),
      // リスケ = リスケ報告
      this.prisma.appointmentReportEvent.findMany({
        where: {
          checkpoint: RESCHEDULE_CHECKPOINT,
          appointment: { deletedAt: null, periodMonth: period, apoUserId: { in: userIds } },
          reportedAt: meetingRange,
        },
        select: { appointmentId: true, appointment: { select: { apoUserId: true } } },
      }),
    ]);

    for (const g of tossUp) {
      if (g.tossUserId && result[g.tossUserId]) result[g.tossUserId].tossUp = g._count._all;
    }
    for (const g of apo) {
      if (g.apoUserId && result[g.apoUserId]) result[g.apoUserId].apo = g._count._all;
    }
    for (const c of contract) {
      const uid = c.contractUserId;
      if (!uid || !result[uid]) continue;
      result[uid].contractSites += 1;
      if (c.appointment?.electronicContractAt) result[uid].etCount += 1;
    }
    // 実施報告は同一アポで複数回付きうるためアポ単位でユニーク化する
    const seenMeeting = new Set<string>();
    for (const e of meetingDone) {
      const uid = e.appointment?.apoUserId;
      if (!uid || !result[uid] || seenMeeting.has(e.appointmentId)) continue;
      seenMeeting.add(e.appointmentId);
      result[uid].meetingDone += 1;
    }
    const seenResched = new Set<string>();
    for (const e of reschedule) {
      const uid = e.appointment?.apoUserId;
      if (!uid || !result[uid] || seenResched.has(e.appointmentId)) continue;
      seenResched.add(e.appointmentId);
      result[uid].reschedule += 1;
    }

    return result;
  }
}
