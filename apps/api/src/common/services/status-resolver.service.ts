import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StatusResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /** category(TOSS/APPOINTMENT/VISIT/MATCHING/ENTRY) + internalCodeからStatusMaster.idを取得 */
  async resolveId(category: string, internalCode: string): Promise<string> {
    const status = await this.prisma.statusMaster.findUnique({
      where: { category_internalCode: { category, internalCode } },
    });
    if (!status) {
      throw new NotFoundException(`ステータスマスタが見つかりません: ${category}/${internalCode}`);
    }
    return status.id;
  }

  /** statusIdからinternalCodeを取得(自動処理の判定に使用。表示名ではなくこちらで判定すること) */
  async internalCodeOf(statusId: string): Promise<string | null> {
    const status = await this.prisma.statusMaster.findUnique({ where: { id: statusId } });
    return status?.internalCode ?? null;
  }
}
