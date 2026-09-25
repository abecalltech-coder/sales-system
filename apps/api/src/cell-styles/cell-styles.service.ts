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
      select: { rowId: true, columnKey: true, textColor: true },
    });
  }

  async setTextColor(tableKey: string, cells: { rowId: string; columnKey: string }[], textColor: string | null) {
    if (cells.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.cellStyle.deleteMany({
          where: { tableKey, OR: cells.map((c) => ({ rowId: c.rowId, columnKey: c.columnKey })) },
        });
        if (textColor) {
          await tx.cellStyle.createMany({
            data: cells.map((c) => ({ tableKey, rowId: c.rowId, columnKey: c.columnKey, textColor })),
            skipDuplicates: true,
          });
        }
      });
    }
    // 同じ一覧を開いている他ユーザーへ反映(全員共有)
    this.realtime.emitToAll('cell-styles.updated', { tableKey });
    return { ok: true };
  }
}
