import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APPOINTMENT_ID_FIELDS, SHARE_SETTING_KEY, SPLITTABLE_CATEGORIES, appointmentScoped } from './master-share';
import { CreateStatusMasterDto, UpdateStatusMasterDto } from './dto/status-master.dto';

@Injectable()
export class StatusMasterService {
  constructor(private readonly prisma: PrismaService) {}

  list(category?: string) {
    return this.prisma.statusMaster.findMany({
      where: category ? { category } : {},
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
  }

  async create(dto: CreateStatusMasterDto) {
    const existing = await this.prisma.statusMaster.findUnique({
      where: { category_internalCode: { category: dto.category, internalCode: dto.internalCode } },
    });
    if (existing) {
      throw new ConflictException('同じcategory/internalCodeのステータスが既に存在します');
    }
    const maxOrder = await this.prisma.statusMaster.aggregate({
      where: { category: dto.category },
      _max: { order: true },
    });
    return this.prisma.statusMaster.create({
      data: {
        category: dto.category,
        internalCode: dto.internalCode,
        displayName: dto.displayName,
        color: dto.color,
        order: dto.order ?? (maxOrder._max.order ?? 0) + 1,
      },
    });
  }

  /** displayName/color/textColor/order/activeのみ変更可能。internalCodeは自動処理の判定基盤のため不変。 */
  async update(id: string, dto: UpdateStatusMasterDto) {
    const existing = await this.prisma.statusMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ステータスが見つかりません');
    // 色は空文字で「色なし」に戻す
    const data = {
      ...dto,
      ...(dto.color !== undefined ? { color: dto.color || null } : {}),
      ...(dto.textColor !== undefined ? { textColor: dto.textColor || null } : {}),
    };
    return this.prisma.statusMaster.update({ where: { id }, data });
  }

  /** 共通をオフにしている項目(カテゴリ)の一覧 */
  async shareOff(): Promise<string[]> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: SHARE_SETTING_KEY } });
    return Array.isArray(row?.value) ? (row!.value as string[]) : [];
  }

  /**
   * 共通のオン/オフ(要望)。
   * オフ: トスの選択肢をアポ用(<カテゴリ>@APPOINTMENT)へ複製し、アポの既存データ(ID参照)を複製先へ付け替える。
   * オン: アポ用の選択肢を表示名でトス側へ統合し(無ければ追加)、アポの既存データを付け替えてからアポ用を削除する。
   */
  async setShared(category: string, shared: boolean) {
    if (!(SPLITTABLE_CATEGORIES as readonly string[]).includes(category)) {
      throw new BadRequestException('この項目は共通のオン/オフを切り替えられません');
    }
    const scoped = appointmentScoped(category);
    const idField = APPOINTMENT_ID_FIELDS[category];
    const off = new Set(await this.shareOff());

    await this.prisma.$transaction(async (tx) => {
      if (!shared && !off.has(category)) {
        const base = await tx.statusMaster.findMany({ where: { category } });
        for (const s of base) {
          const copy = await tx.statusMaster.upsert({
            where: { category_internalCode: { category: scoped, internalCode: s.internalCode } },
            update: {},
            create: {
              category: scoped,
              internalCode: s.internalCode,
              displayName: s.displayName,
              color: s.color,
              textColor: s.textColor,
              order: s.order,
              active: s.active,
            },
          });
          if (idField) await tx.appointment.updateMany({ where: { [idField]: s.id }, data: { [idField]: copy.id } });
        }
        off.add(category);
      } else if (shared && off.has(category)) {
        const scopedRows = await tx.statusMaster.findMany({ where: { category: scoped } });
        for (const s of scopedRows) {
          let target = await tx.statusMaster.findFirst({ where: { category, displayName: s.displayName } });
          if (!target) {
            const codeTaken = await tx.statusMaster.findUnique({
              where: { category_internalCode: { category, internalCode: s.internalCode } },
            });
            target = await tx.statusMaster.create({
              data: {
                category,
                internalCode: codeTaken ? `${s.internalCode}_${s.id.slice(0, 6)}` : s.internalCode,
                displayName: s.displayName,
                color: s.color,
                textColor: s.textColor,
                order: s.order,
                active: s.active,
              },
            });
          }
          if (idField) await tx.appointment.updateMany({ where: { [idField]: s.id }, data: { [idField]: target.id } });
        }
        await tx.statusMaster.deleteMany({ where: { category: scoped } });
        off.delete(category);
      }
      const value = [...off] as Prisma.InputJsonValue;
      await tx.systemSetting.upsert({ where: { key: SHARE_SETTING_KEY }, update: { value }, create: { key: SHARE_SETTING_KEY, value } });
    });
    return { off: [...off] };
  }

  /**
   * 選択肢の削除(要望: マスタ管理で追加・編集・削除)。物理削除。
   * 自動処理が参照する内部コード(TOSS/APPOINTMENT/VISIT/MATCHINGの基本ステータス等)は
   * 誤削除防止のため無効化(active:false)を促す。
   */
  async delete(id: string) {
    const existing = await this.prisma.statusMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ステータスが見つかりません');
    const protectedCategories = ['TOSS', 'APPOINTMENT', 'VISIT', 'MATCHING'];
    if (protectedCategories.includes(existing.category)) {
      throw new ConflictException('基本ステータスは自動処理で使うため削除できません');
    }
    await this.prisma.statusMaster.delete({ where: { id } });
    return { ok: true };
  }
}
