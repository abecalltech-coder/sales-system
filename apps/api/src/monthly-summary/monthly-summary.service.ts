import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValidPeriodMonth, previousPeriodMonth } from '../common/utils/period.util';
import { SummaryAggregationService } from './aggregation.service';
import { SUMMARY_COLUMNS } from './aggregation.constants';

type JsonObj = Record<string, unknown>;

@Injectable()
export class MonthlySummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aggregation: SummaryAggregationService,
  ) {}

  /** 部署(DEPARTMENT_BRANCH)の選択肢 */
  async departments() {
    return this.prisma.statusMaster.findMany({
      where: { category: 'DEPARTMENT_BRANCH', active: true },
      orderBy: { order: 'asc' },
      select: { id: true, displayName: true, color: true },
    });
  }

  /**
   * 対象月 × 部署のシートを取得。無ければ遅延生成し、前月シートから行(ユーザー・役割)を引き継ぐ。
   * 各行に自動集計値(auto)を同梱して返す。
   */
  async get(period: string, departmentId: string) {
    if (!isValidPeriodMonth(period)) throw new BadRequestException('対象月が不正です');
    if (!departmentId) throw new BadRequestException('部署を指定してください');

    const existing = await this.prisma.monthlySummarySheet.findUnique({
      where: { periodMonth_departmentId: { periodMonth: period, departmentId } },
      include: { rows: { orderBy: { order: 'asc' } } },
    });
    const sheet = existing ?? (await this.lazyCreate(period, departmentId));

    const userIds = sheet.rows.map((r) => r.userId).filter((id): id is string => !!id);
    const [auto, users] = await Promise.all([
      this.aggregation.computeForUsers(period, userIds),
      userIds.length
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return {
      period,
      departmentId,
      columns: SUMMARY_COLUMNS,
      rows: sheet.rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.userId ? nameById.get(r.userId) ?? null : null,
        role: r.role,
        order: r.order,
        values: (r.values ?? {}) as JsonObj,
        auto: r.userId ? auto[r.userId] : null,
      })),
    };
  }

  private async lazyCreate(period: string, departmentId: string) {
    const prev = await this.prisma.monthlySummarySheet.findUnique({
      where: { periodMonth_departmentId: { periodMonth: previousPeriodMonth(period), departmentId } },
      include: { rows: { orderBy: { order: 'asc' } } },
    });

    try {
      return await this.prisma.monthlySummarySheet.create({
        data: {
          periodMonth: period,
          departmentId,
          rows: prev
            ? {
                // 前月から行(ユーザー・役割・部署等の手入力属性)を引き継ぐ。実績値・上書き値・予算は空。
                create: prev.rows.map((r) => ({
                  userId: r.userId,
                  role: r.role,
                  order: r.order,
                  values: carryForwardValues(r.values as JsonObj) as Prisma.InputJsonValue,
                })),
              }
            : undefined,
        },
        include: { rows: { orderBy: { order: 'asc' } } },
      });
    } catch (e) {
      // 同時アクセスでの二重生成
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.monthlySummarySheet.findUniqueOrThrow({
          where: { periodMonth_departmentId: { periodMonth: period, departmentId } },
          include: { rows: { orderBy: { order: 'asc' } } },
        });
      }
      throw e;
    }
  }

  async addRow(period: string, departmentId: string, userId?: string, role?: string) {
    let sheet = await this.prisma.monthlySummarySheet.findUnique({
      where: { periodMonth_departmentId: { periodMonth: period, departmentId } },
    });
    if (!sheet) sheet = await this.lazyCreate(period, departmentId);
    const max = await this.prisma.monthlySummaryRow.aggregate({
      where: { sheetId: sheet.id },
      _max: { order: true },
    });
    return this.prisma.monthlySummaryRow.create({
      data: { sheetId: sheet.id, userId: userId ?? null, role: role ?? null, order: (max._max.order ?? 0) + 10 },
    });
  }

  async updateRow(
    id: string,
    patch: { valuesPatch?: JsonObj; role?: string | null; userId?: string | null; order?: number },
  ) {
    const row = await this.prisma.monthlySummaryRow.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('行が見つかりません');

    const nextValues = patch.valuesPatch
      ? cleanValues({ ...((row.values ?? {}) as JsonObj), ...patch.valuesPatch })
      : undefined;

    return this.prisma.monthlySummaryRow.update({
      where: { id },
      data: {
        ...(nextValues !== undefined ? { values: nextValues as Prisma.InputJsonValue } : {}),
        ...(patch.role !== undefined ? { role: patch.role } : {}),
        ...(patch.userId !== undefined ? { userId: patch.userId } : {}),
        ...(patch.order !== undefined ? { order: patch.order } : {}),
      },
    });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.monthlySummaryRow.update({ where: { id }, data: { order: (i + 1) * 10 } })),
    );
    return { ok: true, count: ids.length };
  }

  async bulkDelete(ids: string[]) {
    const result = await this.prisma.monthlySummaryRow.deleteMany({ where: { id: { in: ids } } });
    return { ok: true, deleted: result.count };
  }
}

/** 前月からの引き継ぎ時に残す値(手入力属性のみ。実績上書き・予算・コール数・稼働はリセット) */
function carryForwardValues(values: JsonObj): JsonObj {
  const keep = ['department', 'seats', 'headcount'];
  const out: JsonObj = {};
  for (const k of keep) if (values[k] !== undefined) out[k] = values[k];
  return out;
}

/** 空文字・null のキーを落として JSON を小さく保つ */
function cleanValues(values: JsonObj): JsonObj {
  const out: JsonObj = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}
