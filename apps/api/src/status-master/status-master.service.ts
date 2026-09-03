import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

  /** displayName/color/order/activeのみ変更可能。internalCodeは自動処理の判定基盤のため不変。 */
  async update(id: string, dto: UpdateStatusMasterDto) {
    const existing = await this.prisma.statusMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ステータスが見つかりません');
    return this.prisma.statusMaster.update({ where: { id }, data: dto });
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
      throw new ConflictException('基本ステータスは削除できません。「有効」のチェックを外して無効化してください');
    }
    await this.prisma.statusMaster.delete({ where: { id } });
    return { ok: true };
  }
}
