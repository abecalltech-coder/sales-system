import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SummaryQueryDto } from './dto/summary-query.dto';

function monthRange(): { gte: Date; lte: Date } {
  const now = new Date();
  const gte = new Date(now.getFullYear(), now.getMonth(), 1);
  const lte = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { gte, lte };
}

@Injectable()
export class SummaryService {
  constructor(private readonly prisma: PrismaService) {}

  private range(query: SummaryQueryDto) {
    if (!query.dateFrom && !query.dateTo) return monthRange();
    return {
      gte: query.dateFrom ? new Date(query.dateFrom) : new Date('1970-01-01'),
      lte: query.dateTo ? new Date(query.dateTo) : new Date(),
    };
  }

  /** セクション28: 集計基準日はエンティティごとに異なる(トス=受付日時、成約=成約日、等) */
  async kpi(query: SummaryQueryDto) {
    const range = this.range(query);
    const scopeWhere = {
      ...(query.departmentId ? { snapshotDepartmentId: query.departmentId } : {}),
      ...(query.teamId ? { snapshotTeamId: query.teamId } : {}),
    };

    const [tossCount, appointmentCount, visitScheduledCount, visitArrivedCount, meetingCount, contractCount] = await Promise.all([
      this.prisma.tossCase.count({ where: { deletedAt: null, receivedAt: range, ...scopeWhere } }),
      this.prisma.appointment.count({ where: { deletedAt: null, createdAt: range, ...scopeWhere } }),
      this.prisma.visit.count({ where: { deletedAt: null, scheduledAt: range } }),
      this.prisma.visit.count({ where: { deletedAt: null, arrivedAt: range } }),
      this.prisma.meetingSession.count({ where: { meetingStartedAt: range } }),
      this.prisma.contract.count({ where: { deletedAt: null, contractedAt: range } }),
    ]);

    const rate = (num: number, den: number) => (den === 0 ? 0 : Math.round((num / den) * 1000) / 10);

    return {
      range,
      counts: {
        tossCount,
        appointmentCount,
        visitScheduledCount,
        visitArrivedCount,
        meetingCount,
        contractCount,
      },
      conversionRates: {
        tossToAppointment: rate(appointmentCount, tossCount),
        appointmentToVisit: rate(visitArrivedCount, appointmentCount),
        visitToMeeting: rate(meetingCount, visitArrivedCount),
        meetingToContract: rate(contractCount, meetingCount),
      },
    };
  }

  async byDepartment(query: SummaryQueryDto) {
    const range = this.range(query);
    const groups = await this.prisma.tossCase.groupBy({
      by: ['snapshotDepartmentId'],
      where: { deletedAt: null, receivedAt: range },
      _count: { _all: true },
    });
    return groups.map((g) => ({ departmentId: g.snapshotDepartmentId, tossCount: g._count._all }));
  }

  async byTeam(query: SummaryQueryDto) {
    const range = this.range(query);
    const groups = await this.prisma.tossCase.groupBy({
      by: ['snapshotTeamId'],
      where: { deletedAt: null, receivedAt: range, ...(query.departmentId ? { snapshotDepartmentId: query.departmentId } : {}) },
      _count: { _all: true },
    });
    return groups.map((g) => ({ teamId: g.snapshotTeamId, tossCount: g._count._all }));
  }

  async byUser(query: SummaryQueryDto) {
    const range = this.range(query);
    const groups = await this.prisma.tossCase.groupBy({
      by: ['tossUserId'],
      where: { deletedAt: null, receivedAt: range, ...(query.teamId ? { snapshotTeamId: query.teamId } : {}) },
      _count: { _all: true },
      orderBy: { _count: { tossUserId: 'desc' } },
    });
    return groups.map((g) => ({ userId: g.tossUserId, tossCount: g._count._all }));
  }

  /** 日別の推移(折れ線グラフ用)。件数が多い場合はPhase8以降で日別集計テーブルへ移行予定(セクション35)。 */
  async timeseries(query: SummaryQueryDto) {
    const range = this.range(query);
    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "receivedAt") as day, count(*) as count
      FROM "TossCase"
      WHERE "deletedAt" IS NULL AND "receivedAt" BETWEEN ${range.gte} AND ${range.lte}
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), count: Number(r.count) }));
  }

  async funnel(query: SummaryQueryDto) {
    const kpi = await this.kpi(query);
    return {
      steps: [
        { label: 'トス', count: kpi.counts.tossCount },
        { label: 'アポ', count: kpi.counts.appointmentCount },
        { label: '訪問到着', count: kpi.counts.visitArrivedCount },
        { label: '商談', count: kpi.counts.meetingCount },
        { label: '成約', count: kpi.counts.contractCount },
      ],
    };
  }

  /** 訪問営業指標(セクション28): 再訪問数・不在数・キャンセル数・遅刻数・平均訪問時間・平均商談時間等 */
  async visits(query: SummaryQueryDto) {
    const range = this.range(query);
    const where = { deletedAt: null, scheduledAt: range, ...(query.userId ? { fieldSalesUserId: query.userId } : {}) };

    const [revisitCount, absentCount, cancelledCount, delayedCount, completedCount, sessions] = await Promise.all([
      this.prisma.visit.count({ where: { ...where, visitKind: 'REVISIT' } }),
      this.prisma.visitStatusHistory.count({ where: { toStatusId: { in: await this.statusIds('VISIT', 'VISIT_ABSENT') } } }),
      this.prisma.visitStatusHistory.count({ where: { toStatusId: { in: await this.statusIds('VISIT', 'VISIT_CANCELLED') } } }),
      this.prisma.visitStatusHistory.count({ where: { toStatusId: { in: await this.statusIds('VISIT', 'VISIT_DELAYED') } } }),
      this.prisma.visit.count({ where }),
      this.prisma.meetingSession.findMany({
        where: { meetingStartedAt: range },
        select: { waitingMinutes: true, meetingDurationMinutes: true },
      }),
    ]);

    const avg = (values: (number | null)[]) => {
      const filtered = values.filter((v): v is number => v != null);
      if (filtered.length === 0) return null;
      return Math.round((filtered.reduce((a, b) => a + b, 0) / filtered.length) * 10) / 10;
    };

    return {
      revisitCount,
      absentCount,
      cancelledCount,
      delayedCount,
      completedCount,
      averageWaitingMinutes: avg(sessions.map((s) => s.waitingMinutes)),
      averageMeetingDurationMinutes: avg(sessions.map((s) => s.meetingDurationMinutes)),
    };
  }

  private async statusIds(category: string, internalCode: string): Promise<string[]> {
    const status = await this.prisma.statusMaster.findUnique({
      where: { category_internalCode: { category, internalCode } },
    });
    return status ? [status.id] : [];
  }
}
