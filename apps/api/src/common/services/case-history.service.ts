import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CaseHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    entityType: string;
    entityId: string;
    field: string;
    before: unknown;
    after: unknown;
    changedBy?: string;
  }) {
    await this.prisma.caseHistory.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        field: params.field,
        before: params.before as never,
        after: params.after as never,
        changedBy: params.changedBy,
      },
    });
  }

  /** 更新前後のオブジェクトを比較し、変化したフィールドだけ履歴に残す */
  async recordDiff(
    entityType: string,
    entityId: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    changedBy?: string,
  ) {
    const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const field of fields) {
      if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
        await this.record({ entityType, entityId, field, before: before[field], after: after[field], changedBy });
      }
    }
  }
}
