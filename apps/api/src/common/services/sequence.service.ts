import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PREFIX: Record<'TOSS' | 'APPOINTMENT' | 'VISIT' | 'CONTRACT', string> = {
  TOSS: 'TOS',
  APPOINTMENT: 'APO',
  VISIT: 'VIS',
  CONTRACT: 'CNT',
};

/**
 * 案件番号(例: TOS-202608-000001)を年月+種別単位でトランザクション採番する。
 * SequenceCounterテーブルへの行ロック(upsert + increment)により競合を防ぐ。
 */
@Injectable()
export class SequenceService {
  constructor(private readonly prisma: PrismaService) {}

  async nextCaseNumber(entity: keyof typeof PREFIX, now = new Date()): Promise<string> {
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = PREFIX[entity];
    const key = `${prefix}-${yyyymm}`;

    const counter = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.sequenceCounter.upsert({
        where: { key },
        update: { lastValue: { increment: 1 } },
        create: { key, lastValue: 1 },
      });
      return updated.lastValue;
    });

    return `${key}-${String(counter).padStart(6, '0')}`;
  }
}
