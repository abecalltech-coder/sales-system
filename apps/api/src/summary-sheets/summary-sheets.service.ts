import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 行/列削除時の番号詰めをupdateManyの一括UPDATEで行うと、処理順序次第で
// [sheetId, row, col]の一意制約に一時的に抵触する可能性があるため、
// 一旦誰とも衝突しない大きな負の範囲へ退避してから正しい位置へ戻す2段階更新にする。
const SHIFT_PARK_OFFSET = 1_000_000;

@Injectable()
export class SummarySheetsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.summarySheet.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, order: true, rowCount: true, colCount: true },
    });
  }

  async create(name: string) {
    const max = await this.prisma.summarySheet.aggregate({
      where: { deletedAt: null },
      _max: { order: true },
    });
    return this.prisma.summarySheet.create({
      data: { name, order: (max._max.order ?? -1) + 1 },
    });
  }

  async findOne(id: string) {
    const sheet = await this.ensureExists(id);
    const cells = await this.prisma.summarySheetCell.findMany({
      where: { sheetId: id },
      select: { row: true, col: true, value: true },
    });
    return { ...sheet, cells };
  }

  async rename(id: string, name: string) {
    await this.ensureExists(id);
    return this.prisma.summarySheet.update({ where: { id }, data: { name } });
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.summarySheet.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  async upsertCell(sheetId: string, row: number, col: number, value: string, userId: string) {
    const sheet = await this.ensureExists(sheetId);
    if (row >= sheet.rowCount || col >= sheet.colCount) {
      throw new BadRequestException('範囲外のセルです');
    }
    return this.prisma.summarySheetCell.upsert({
      where: { sheetId_row_col: { sheetId, row, col } },
      update: { value, updatedBy: userId },
      create: { sheetId, row, col, value, updatedBy: userId },
    });
  }

  async addRow(sheetId: string) {
    const sheet = await this.ensureExists(sheetId);
    return this.prisma.summarySheet.update({ where: { id: sheetId }, data: { rowCount: sheet.rowCount + 1 } });
  }

  async removeRow(sheetId: string, row: number) {
    const sheet = await this.ensureExists(sheetId);
    if (row >= sheet.rowCount) throw new BadRequestException('範囲外の行です');

    return this.prisma.$transaction(async (tx) => {
      await tx.summarySheetCell.deleteMany({ where: { sheetId, row } });
      await tx.summarySheetCell.updateMany({
        where: { sheetId, row: { gt: row } },
        data: { row: { decrement: SHIFT_PARK_OFFSET } },
      });
      await tx.summarySheetCell.updateMany({
        where: { sheetId, row: { lt: 0 } },
        data: { row: { increment: SHIFT_PARK_OFFSET - 1 } },
      });
      return tx.summarySheet.update({ where: { id: sheetId }, data: { rowCount: sheet.rowCount - 1 } });
    });
  }

  async addColumn(sheetId: string) {
    const sheet = await this.ensureExists(sheetId);
    return this.prisma.summarySheet.update({ where: { id: sheetId }, data: { colCount: sheet.colCount + 1 } });
  }

  async removeColumn(sheetId: string, col: number) {
    const sheet = await this.ensureExists(sheetId);
    if (col >= sheet.colCount) throw new BadRequestException('範囲外の列です');

    return this.prisma.$transaction(async (tx) => {
      await tx.summarySheetCell.deleteMany({ where: { sheetId, col } });
      await tx.summarySheetCell.updateMany({
        where: { sheetId, col: { gt: col } },
        data: { col: { decrement: SHIFT_PARK_OFFSET } },
      });
      await tx.summarySheetCell.updateMany({
        where: { sheetId, col: { lt: 0 } },
        data: { col: { increment: SHIFT_PARK_OFFSET - 1 } },
      });
      return tx.summarySheet.update({ where: { id: sheetId }, data: { colCount: sheet.colCount - 1 } });
    });
  }

  private async ensureExists(id: string) {
    const sheet = await this.prisma.summarySheet.findFirst({ where: { id, deletedAt: null } });
    if (!sheet) throw new NotFoundException('シートが見つかりません');
    return sheet;
  }
}
