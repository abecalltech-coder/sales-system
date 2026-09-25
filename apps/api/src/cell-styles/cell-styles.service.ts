import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class CellStylesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  list(tableKey: string) {
    return this.prisma.cellStyle.findMany({
      where: { tableKey },
      select: { rowId: true, columnKey: true, textColor: true, bold: true },
    });
  }

  /** 指定したセルの書式を変更する。patch で省略した項目はそのまま残す。 */
  async setStyle(
    tableKey: string,
    cells: { rowId: string; columnKey: string }[],
    patch: { textColor?: string | null; bold?: boolean },
  ) {
    const data: { textColor?: string | null; bold?: boolean } = {};
    if (patch.textColor !== undefined) data.textColor = patch.textColor;
    if (patch.bold !== undefined) data.bold = patch.bold;
    if (cells.length > 0 && Object.keys(data).length > 0) {
      const target = { tableKey, OR: cells.map((c) => ({ rowId: c.rowId, columnKey: c.columnKey })) };
      await this.prisma.$transaction([
        this.prisma.cellStyle.createMany({
          data: cells.map((c) => ({ tableKey, rowId: c.rowId, columnKey: c.columnKey })),
          skipDuplicates: true,
        }),
        this.prisma.cellStyle.updateMany({ where: target, data }),
        // 書式が何も残っていないセルは行ごと消す
        this.prisma.cellStyle.deleteMany({ where: { ...target, textColor: null, bold: false } }),
      ]);
    }
    // 同じ一覧を開いている他ユーザーへ反映(全員共有)
    this.realtime.emitToAll('cell-styles.updated', { tableKey });
    return { ok: true };
  }
}
