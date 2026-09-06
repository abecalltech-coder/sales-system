import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { periodMonthDays, toPeriodMonth } from '../common/utils/period.util';
import { CreateFieldDto, UpdateFieldDto } from './dto/final-report.dto';

type JsonObj = Record<string, unknown>;

/** JST の "YYYY-MM-DD" */
export function jstDateKey(d: Date = new Date()): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(jst.getUTCDate()).padStart(2, '0')}`;
}

@Injectable()
export class FinalReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- 項目(行)定義 ---------------------------------------------------
  listFields(all = false) {
    return this.prisma.finalReportField.findMany({
      where: all ? {} : { active: true },
      orderBy: { order: 'asc' },
    });
  }

  async createField(dto: CreateFieldDto) {
    const max = await this.prisma.finalReportField.aggregate({ _max: { order: true } });
    return this.prisma.finalReportField.create({
      data: {
        label: dto.label,
        fieldType: dto.fieldType ?? 'NUMBER',
        unit: dto.unit,
        order: dto.order ?? (max._max.order ?? 0) + 10,
      },
    });
  }

  async updateField(id: string, dto: UpdateFieldDto) {
    const existing = await this.prisma.finalReportField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('項目が見つかりません');
    return this.prisma.finalReportField.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.fieldType !== undefined ? { fieldType: dto.fieldType } : {}),
        ...(dto.computed !== undefined ? { computed: dto.computed } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteField(id: string) {
    // seed項目(code付き)は無効化のみ、それ以外は物理削除
    const f = await this.prisma.finalReportField.findUnique({ where: { id } });
    if (!f) throw new NotFoundException('項目が見つかりません');
    if (f.code) {
      return this.prisma.finalReportField.update({ where: { id }, data: { active: false } });
    }
    await this.prisma.finalReportField.delete({ where: { id } });
    return { ok: true };
  }

  // ---- 入力(日別) ---------------------------------------------------
  async getMonth(userId: string, period: string) {
    const days = periodMonthDays(period);
    const [fields, entries, user] = await Promise.all([
      this.listFields(false),
      this.prisma.finalReportEntry.findMany({
        where: { userId, date: { in: days } },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);
    const byDate: Record<string, JsonObj> = {};
    for (const e of entries) byDate[e.date] = (e.values ?? {}) as JsonObj;
    return { period, userId, userName: user?.name ?? null, days, fields, entries: byDate };
  }

  async upsertEntry(userId: string, date: string, valuesPatch: JsonObj) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('日付が不正です');
    const existing = await this.prisma.finalReportEntry.findUnique({ where: { userId_date: { userId, date } } });
    const merged = clean({ ...((existing?.values ?? {}) as JsonObj), ...valuesPatch });
    return this.prisma.finalReportEntry.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, values: merged as Prisma.InputJsonValue },
      update: { values: merged as Prisma.InputJsonValue },
    });
  }

  // ---- 19:00 アラート用 ---------------------------------------------
  /**
   * 指定日(JST "YYYY-MM-DD")に「シフト表で稼働時間 > 0(=出勤日)」かつ
   * 「最終報告が未入力(当日の列に値が1つも無い)」のユーザー一覧を返す。
   */
  async findUnreported(date: string): Promise<{ userId: string; name: string }[]> {
    const period = toPeriodMonth(new Date(`${date}T00:00:00+09:00`));
    const shift = await this.prisma.monthlyShiftSheet.findUnique({
      where: { periodMonth: period },
      include: { rows: true },
    });
    if (!shift) return [];

    const workingUserIds = shift.rows
      .filter((r) => r.userId && Number((r.days as Record<string, unknown>)?.[date] ?? 0) > 0)
      .map((r) => r.userId as string);
    if (workingUserIds.length === 0) return [];

    const entries = await this.prisma.finalReportEntry.findMany({
      where: { userId: { in: workingUserIds }, date },
      select: { userId: true, values: true },
    });
    const reported = new Set(
      entries.filter((e) => Object.keys((e.values ?? {}) as JsonObj).length > 0).map((e) => e.userId),
    );

    const unreportedIds = workingUserIds.filter((id) => !reported.has(id));
    if (unreportedIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: unreportedIds }, deletedAt: null },
      select: { id: true, name: true },
    });
    return users.map((u) => ({ userId: u.id, name: u.name }));
  }
}

function clean(obj: JsonObj): JsonObj {
  const out: JsonObj = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}
