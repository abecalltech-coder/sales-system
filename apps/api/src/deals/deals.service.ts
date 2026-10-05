import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { markManual, mergeImported } from './import-merge';
import { DealAutoTasksService } from './deal-auto-tasks.service';
import {
  CreateDealDto,
  CreateDealFieldDto,
  CreateDealFieldOptionDto,
  UpdateDealDto,
  UpdateDealFieldDto,
  UpdateDealFieldOptionDto,
} from './dto/deal.dto';

function slugifyFieldKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ぁ-んァ-ヶ一-龠々ー]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || 'field'}_${suffix}`;
}

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autoTasks: DealAutoTasksService,
  ) {}

  // ---- 列(フィールド)定義 -------------------------------------------
  listFields(all = false) {
    return this.prisma.dealField.findMany({
      where: all ? {} : { active: true },
      orderBy: { order: 'asc' },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  }

  async createField(dto: CreateDealFieldDto) {
    const max = await this.prisma.dealField.aggregate({ _max: { order: true } });
    const field = await this.prisma.dealField.create({
      data: {
        fieldKey: slugifyFieldKey(dto.label),
        label: dto.label,
        dataType: dto.dataType,
        order: dto.order ?? (max._max.order ?? 0) + 10,
      },
    });
    if (dto.dataType === 'SELECT' && dto.options?.length) {
      await this.prisma.dealFieldOption.createMany({
        data: dto.options
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label, i) => ({ fieldId: field.id, label, order: (i + 1) * 10 })),
      });
    }
    return this.prisma.dealField.findUniqueOrThrow({ where: { id: field.id }, include: { options: true } });
  }

  async updateField(id: string, dto: UpdateDealFieldDto) {
    const existing = await this.prisma.dealField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('列が見つかりません');
    return this.prisma.dealField.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { options: true },
    });
  }

  async deleteField(id: string) {
    const existing = await this.prisma.dealField.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('列が見つかりません');
    await this.prisma.dealField.delete({ where: { id } });
    return { ok: true };
  }

  // 表のヘッダーをドラッグして列の並び順を変える(要望)
  async reorderFields(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.dealField.update({ where: { id }, data: { order: (i + 1) * 10 } })),
    );
    return { ok: true, count: ids.length };
  }

  // ---- 選択肢(SELECT型の列) -------------------------------------------
  async createOption(fieldId: string, dto: CreateDealFieldOptionDto) {
    const field = await this.prisma.dealField.findUnique({ where: { id: fieldId } });
    if (!field) throw new NotFoundException('列が見つかりません');
    const max = await this.prisma.dealFieldOption.aggregate({ where: { fieldId }, _max: { order: true } });
    return this.prisma.dealFieldOption.create({
      data: {
        fieldId,
        label: dto.label,
        color: dto.color,
        order: dto.order ?? (max._max.order ?? 0) + 10,
      },
    });
  }

  async updateOption(id: string, dto: UpdateDealFieldOptionDto) {
    const existing = await this.prisma.dealFieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選択肢が見つかりません');
    const data = {
      ...dto,
      ...(dto.color !== undefined ? { color: dto.color || null } : {}),
      ...(dto.textColor !== undefined ? { textColor: dto.textColor || null } : {}),
    };
    return this.prisma.dealFieldOption.update({ where: { id }, data });
  }

  async deleteOption(id: string) {
    const existing = await this.prisma.dealFieldOption.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('選択肢が見つかりません');
    await this.prisma.dealFieldOption.delete({ where: { id } });
    return { ok: true };
  }

  // ---- 案件(行) -------------------------------------------------------
  async list(params: { page: number; pageSize: number; keyword?: string }) {
    const where: Prisma.DealWhereInput = {
      deletedAt: null,
      ...(params.keyword
        ? { values: { path: ['case_name'], string_contains: params.keyword } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.deal.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: [{ manualOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.deal.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async findOne(id: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id, deletedAt: null } });
    if (!deal) throw new NotFoundException('案件が見つかりません');
    return deal;
  }

  async create(dto: CreateDealDto, userId: string) {
    // 新規行は一覧の先頭に出す(末尾追加だと気づかれにくいため)
    const min = await this.prisma.deal.aggregate({ _min: { manualOrder: true } });
    const deal = await this.prisma.deal.create({
      data: {
        values: clean((dto.values ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
        manualOrder: (min._min.manualOrder ?? 0) - 10,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await this.autoTasks.sync([deal.id], userId);
    return deal;
  }

  // 一括投入(要望): 外部シートを貼り付けてまとめて作成する。既存行の先頭に積む(create()と同じ並び)。
  async bulkCreate(rows: { values?: Record<string, unknown> }[], userId: string, updates: { id: string; values: Record<string, unknown> }[] = []) {
    let count = 0;
    const createdIds: string[] = [];
    if (rows.length > 0) {
      const min = await this.prisma.deal.aggregate({ _min: { manualOrder: true } });
      const base = (min._min.manualOrder ?? 0) - 10 * rows.length;
      const created = await this.prisma.$transaction(
        rows.map((r, i) => {
          const values = clean((r.values ?? {}) as Record<string, unknown>);
          return this.prisma.deal.create({
            data: {
              values: values as Prisma.InputJsonValue,
              // 一括投入で作った案件の値は、次の一括投入で更新してよい
              importedKeys: Object.keys(values),
              manualOrder: base + i * 10,
              createdBy: userId,
              updatedBy: userId,
            },
          });
        }),
      );
      count = created.length;
      createdIds.push(...created.map((d) => d.id));
    }

    // 既存の案件への追記(要望): 手打ち・システム内で入れた値は絶対に上書きしない
    let updated = 0;
    let protectedFields = 0;
    for (const u of updates) {
      const existing = await this.prisma.deal.findFirst({ where: { id: u.id, deletedAt: null } });
      if (!existing) continue;
      const m = mergeImported((existing.values ?? {}) as Record<string, unknown>, existing.importedKeys, clean(u.values));
      protectedFields += m.protectedKeys.length;
      if (m.changed.length === 0) continue;
      // 読んだあとに手で編集されていたら書き込まない(version で確認)
      const r = await this.prisma.deal.updateMany({
        where: { id: existing.id, version: existing.version },
        data: { values: clean(m.values) as Prisma.InputJsonValue, importedKeys: m.importedKeys, updatedBy: userId, version: { increment: 1 } },
      });
      updated += r.count;
    }
    await this.autoTasks.sync([...createdIds, ...updates.map((u) => u.id)], userId);
    return { ok: true, count, updated, protectedFields };
  }

  async update(id: string, dto: UpdateDealDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }
    const merged = clean({ ...((existing.values ?? {}) as Record<string, unknown>), ...dto.values });
    const result = await this.prisma.deal.updateMany({
      where: { id, version: dto.version },
      data: {
        values: merged as Prisma.InputJsonValue,
        // 手で編集した項目は以後、一括投入で上書きしない(要望)
        importedKeys: markManual(existing.importedKeys, Object.keys(dto.values ?? {})),
        updatedBy: userId,
        version: { increment: 1 },
      },
    });
    if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
    await this.autoTasks.sync([id], userId);
    return this.prisma.deal.findUniqueOrThrow({ where: { id } });
  }

  async reorder(ids: string[]) {
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.deal.update({ where: { id }, data: { manualOrder: (i + 1) * 10 } })),
    );
    return { ok: true, count: ids.length };
  }

  async bulkDelete(ids: string[], userId: string) {
    const result = await this.prisma.deal.updateMany({
      where: { id: { in: ids }, deletedAt: null },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await this.autoTasks.sync(ids, userId); // 削除した案件の自動タスクも消す
    return { ok: true, deleted: result.count };
  }
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}
