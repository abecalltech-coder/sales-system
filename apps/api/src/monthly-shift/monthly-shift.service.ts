import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isValidPeriodMonth, periodMonthDays, previousPeriodMonth } from '../common/utils/period.util';

type JsonObj = Record<string, unknown>;

/** 引き継ぐ属性キー(氏名はuserId由来、日別値・累計時間は引き継がない) */
const CARRY_ATTRS = ['role', 'company', 'division', 'cost', 'jurisdiction', 'assignedMonth', 'lcode', 'seats'];

export const SHIFT_ATTRIBUTE_DEFS = [
  { code: 'role', label: '役職' },
  { code: 'company', label: '所属会社' },
  { code: 'division', label: '事業部' },
  { code: 'cost', label: 'コスト' },
  { code: 'jurisdiction', label: '管轄' },
  { code: 'assignedMonth', label: '配属月' },
  { code: 'lcode', label: 'Lコード' },
  { code: 'cumulativeHours', label: '累計時間' },
  { code: 'seats', label: '席数' },
];

@Injectable()
export class MonthlyShiftService {
  constructor(private readonly prisma: PrismaService) {}

  async get(period: string) {
    if (!isValidPeriodMonth(period)) throw new BadRequestException('対象月が不正です');

    const existing = await this.prisma.monthlyShiftSheet.findUnique({
      where: { periodMonth: period },
      include: { rows: { orderBy: { order: 'asc' } } },
    });
    const sheet = existing ?? (await this.lazyCreate(period));

    const userIds = sheet.rows.map((r) => r.userId).filter((id): id is string => !!id);
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    return {
      period,
      days: periodMonthDays(period),
      attributeDefs: SHIFT_ATTRIBUTE_DEFS,
      rows: sheet.rows.map((r, i) => ({
        id: r.id,
        no: i + 1,
        userId: r.userId,
        userName: r.userId ? nameById.get(r.userId) ?? null : null,
        order: r.order,
        attributes: (r.attributes ?? {}) as JsonObj,
        days: (r.days ?? {}) as Record<string, number>,
      })),
    };
  }

  /** 対象月のシートを(無ければ)生成する。月次ロールオーバーcron用。 */
  async ensureForMonth(period: string) {
    if (!isValidPeriodMonth(period)) return { created: 0 };
    const exists = await this.prisma.monthlyShiftSheet.findUnique({
      where: { periodMonth: period },
      select: { id: true },
    });
    if (exists) return { created: 0 };
    await this.lazyCreate(period);
    return { created: 1 };
  }

  private async lazyCreate(period: string) {
    const prev = await this.prisma.monthlyShiftSheet.findUnique({
      where: { periodMonth: previousPeriodMonth(period) },
      include: { rows: { orderBy: { order: 'asc' } } },
    });
    try {
      return await this.prisma.monthlyShiftSheet.create({
        data: {
          periodMonth: period,
          rows: prev
            ? {
                create: prev.rows.map((r) => ({
                  userId: r.userId,
                  order: r.order,
                  attributes: pick(r.attributes as JsonObj, CARRY_ATTRS) as Prisma.InputJsonValue,
                  days: {},
                })),
              }
            : undefined,
        },
        include: { rows: { orderBy: { order: 'asc' } } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return this.prisma.monthlyShiftSheet.findUniqueOrThrow({
          where: { periodMonth: period },
          include: { rows: { orderBy: { order: 'asc' } } },
        });
      }
      throw e;
    }
  }

  async addRow(period: string, userId?: string) {
    const existing = await this.prisma.monthlyShiftSheet.findUnique({ where: { periodMonth: period } });
    const sheet = existing ?? (await this.lazyCreate(period));
    const max = await this.prisma.monthlyShiftRow.aggregate({ where: { sheetId: sheet.id }, _max: { order: true } });
    return this.prisma.monthlyShiftRow.create({
      data: { sheetId: sheet.id, userId: userId ?? null, order: (max._max.order ?? 0) + 10 },
    });
  }

  async updateRow(
    id: string,
    patch: { attributesPatch?: JsonObj; daysPatch?: Record<string, number | null>; userId?: string | null; order?: number },
  ) {
    const row = await this.prisma.monthlyShiftRow.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('行が見つかりません');

    const nextAttrs = patch.attributesPatch
      ? clean({ ...((row.attributes ?? {}) as JsonObj), ...patch.attributesPatch })
      : undefined;

    let nextDays: Record<string, number> | undefined;
    if (patch.daysPatch) {
      nextDays = { ...((row.days ?? {}) as Record<string, number>) };
      for (const [k, v] of Object.entries(patch.daysPatch)) {
        if (v == null || v === 0) delete nextDays[k];
        else nextDays[k] = v;
      }
    }

    return this.prisma.monthlyShiftRow.update({
      where: { id },
      data: {
        ...(nextAttrs !== undefined ? { attributes: nextAttrs as Prisma.InputJsonValue } : {}),
        ...(nextDays !== undefined ? { days: nextDays as Prisma.InputJsonValue } : {}),
        ...(patch.userId !== undefined ? { userId: patch.userId } : {}),
        ...(patch.order !== undefined ? { order: patch.order } : {}),
      },
    });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.monthlyShiftRow.update({ where: { id }, data: { order: (i + 1) * 10 } })),
    );
    return { ok: true, count: ids.length };
  }

  async bulkDelete(ids: string[]) {
    const result = await this.prisma.monthlyShiftRow.deleteMany({ where: { id: { in: ids } } });
    return { ok: true, deleted: result.count };
  }
}

function pick(obj: JsonObj, keys: string[]): JsonObj {
  const out: JsonObj = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== '') out[k] = obj[k];
  return out;
}
function clean(obj: JsonObj): JsonObj {
  const out: JsonObj = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}
