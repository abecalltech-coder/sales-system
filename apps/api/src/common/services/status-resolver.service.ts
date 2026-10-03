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

  /**
   * トスの進捗が「アポ詳細を自動作成する進捗」か(要望: 「アポイント」を廃止し「前確OK」に一本化)。
   * 画面から追加した選択肢は内部コードが自動採番のため、表示名「前確OK」でも判定する。
   */
  async isTossConversionProgress(statusId: string): Promise<boolean> {
    const s = await this.prisma.statusMaster.findUnique({ where: { id: statusId } });
    if (!s || s.category !== 'TOSS_PROGRESS') return false;
    return ['PROGRESS_PRE_CONFIRM_OK', 'PROGRESS_APPOINTMENT'].includes(s.internalCode) || s.displayName.trim() === '前確OK';
  }

  /** statusIdからinternalCodeを取得(自動処理の判定に使用。表示名ではなくこちらで判定すること) */
  async internalCodeOf(statusId: string): Promise<string | null> {
    const status = await this.prisma.statusMaster.findUnique({ where: { id: statusId } });
    return status?.internalCode ?? null;
  }
}
