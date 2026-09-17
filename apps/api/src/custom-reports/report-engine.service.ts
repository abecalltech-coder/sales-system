import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { jstDayStart, jstMonthLabel, jstWeekLabel, resolvePresetRange } from '../common/utils/date-range.util';
import { ReportConfigDto, ReportRow } from './dto/custom-report.dto';

type DataSource = ReportConfigDto['dataSource'];
type Axis = ReportConfigDto['axis'];

interface RawRecord {
  userId: string | null;
  productId: string | null;
  date: Date;
}

// 集計対象データの営業ファネル順序(要望: 転換率はひとつ前の段階を分母にする)
const PREDECESSOR: Record<DataSource, DataSource | null> = {
  TOSS: null,
  APPOINTMENT: 'TOSS',
  VISIT: 'APPOINTMENT',
  CONTRACT: 'VISIT',
  ENTRY: 'CONTRACT',
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ReportEngineService {
  constructor(private readonly prisma: PrismaService) {}

  resolveRange(config: ReportConfigDto): { start: Date; end: Date } {
    if (config.periodMode === 'CUSTOM') {
      if (!config.startDate || !config.endDate) throw new Error('開始日・終了日を指定してください');
      const start = jstDayStart(config.startDate);
      const end = new Date(jstDayStart(config.endDate).getTime() + DAY_MS);
      return { start, end };
    }
    if (!config.preset) throw new Error('期間プリセットを指定してください');
    return resolvePresetRange(config.preset);
  }

  async computeRows(config: ReportConfigDto): Promise<ReportRow[]> {
    const range = this.resolveRange(config);
    const records = await this.fetchRecords(config.dataSource, range);
    const grouped = await this.groupByAxis(records, config.axis);

    let predecessorGrouped: Map<string, number> | null = null;
    if (config.metrics.includes('CONVERSION_RATE')) {
      const predSource = PREDECESSOR[config.dataSource];
      if (predSource) {
        const predRecords = await this.fetchRecords(predSource, range);
        const predGroups = await this.groupByAxis(predRecords, config.axis);
        predecessorGrouped = new Map([...predGroups.entries()].map(([k, v]) => [k, v.count]));
      }
    }

    let rows: ReportRow[] = [...grouped.entries()].map(([axisKey, v]) => {
      const predCount = predecessorGrouped?.get(axisKey) ?? null;
      const conversionRate =
        config.metrics.includes('CONVERSION_RATE') && predCount != null && predCount > 0 ? v.count / predCount : null;
      return { axisKey, axisLabel: v.label, count: v.count, conversionRate, rank: null };
    });

    const rankMetric: 'count' | 'conversionRate' = config.metrics.includes('COUNT') ? 'count' : 'conversionRate';
    rows.sort((a, b) => (b[rankMetric] ?? 0) - (a[rankMetric] ?? 0));
    if (config.metrics.includes('RANKING')) {
      rows = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    }

    return rows;
  }

  private async fetchRecords(dataSource: DataSource, range: { start: Date; end: Date }): Promise<RawRecord[]> {
    const { start, end } = range;
    switch (dataSource) {
      case 'TOSS': {
        const rows = await this.prisma.tossCase.findMany({
          where: { deletedAt: null, receivedAt: { gte: start, lt: end } },
          select: { tossUserId: true, productId: true, receivedAt: true },
        });
        return rows.map((r) => ({ userId: r.tossUserId, productId: r.productId, date: r.receivedAt }));
      }
      case 'APPOINTMENT': {
        const rows = await this.prisma.appointment.findMany({
          where: {
            deletedAt: null,
            OR: [
              { meetingStartAt: { gte: start, lt: end } },
              { meetingStartAt: null, createdAt: { gte: start, lt: end } },
            ],
          },
          select: { apoUserId: true, meetingStartAt: true, createdAt: true, tossCase: { select: { productId: true } } },
        });
        return rows.map((r) => ({
          userId: r.apoUserId,
          productId: r.tossCase?.productId ?? null,
          date: r.meetingStartAt ?? r.createdAt,
        }));
      }
      case 'VISIT': {
        const rows = await this.prisma.visit.findMany({
          where: { deletedAt: null, scheduledAt: { gte: start, lt: end } },
          select: {
            fieldSalesUserId: true,
            scheduledAt: true,
            appointment: { select: { tossCase: { select: { productId: true } } } },
          },
        });
        return rows.map((r) => ({
          userId: r.fieldSalesUserId,
          productId: r.appointment?.tossCase?.productId ?? null,
          date: r.scheduledAt,
        }));
      }
      case 'CONTRACT': {
        const rows = await this.prisma.contract.findMany({
          where: { deletedAt: null, contractedAt: { gte: start, lt: end } },
          select: { contractUserId: true, contractedAt: true, appointment: { select: { tossCase: { select: { productId: true } } } } },
        });
        return rows.map((r) => ({
          userId: r.contractUserId,
          productId: r.appointment?.tossCase?.productId ?? null,
          date: r.contractedAt as Date,
        }));
      }
      case 'ENTRY': {
        const rows = await this.prisma.contract.findMany({
          where: { deletedAt: null, createdAt: { gte: start, lt: end } },
          select: { contractUserId: true, createdAt: true, appointment: { select: { tossCase: { select: { productId: true } } } } },
        });
        return rows.map((r) => ({
          userId: r.contractUserId,
          productId: r.appointment?.tossCase?.productId ?? null,
          date: r.createdAt,
        }));
      }
    }
  }

  private async groupByAxis(records: RawRecord[], axis: Axis): Promise<Map<string, { label: string; count: number }>> {
    const result = new Map<string, { label: string; count: number }>();
    const bump = (key: string, label: string) => {
      const cur = result.get(key);
      if (cur) cur.count += 1;
      else result.set(key, { label, count: 1 });
    };

    if (axis === 'WEEK') {
      for (const r of records) bump(jstWeekLabel(r.date), jstWeekLabel(r.date));
      return result;
    }
    if (axis === 'MONTH') {
      for (const r of records) bump(jstMonthLabel(r.date), jstMonthLabel(r.date));
      return result;
    }
    if (axis === 'PRODUCT') {
      const productIds = [...new Set(records.map((r) => r.productId).filter((x): x is string => !!x))];
      const products = productIds.length
        ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
        : [];
      const nameOf = new Map(products.map((p) => [p.id, p.name]));
      for (const r of records) {
        const key = r.productId ?? '__none__';
        bump(key, r.productId ? nameOf.get(r.productId) ?? '(不明な商材)' : '商材未設定');
      }
      return result;
    }

    // USER / TEAM / DEPARTMENT: 担当者の現在の所属で集計する
    const userIds = [...new Set(records.map((r) => r.userId).filter((x): x is string => !!x))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, departmentId: true, teamId: true, department: { select: { name: true } }, team: { select: { name: true } } },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    for (const r of records) {
      const u = r.userId ? byId.get(r.userId) : undefined;
      if (axis === 'USER') {
        bump(r.userId ?? '__none__', u?.name ?? '未割当');
      } else if (axis === 'TEAM') {
        bump(u?.teamId ?? '__none__', u?.team?.name ?? '未所属');
      } else {
        bump(u?.departmentId ?? '__none__', u?.department?.name ?? '未所属');
      }
    }
    return result;
  }
}
