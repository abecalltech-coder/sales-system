import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntryDto, UpdateEntryDto } from './dto/entry.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly caseHistory: CaseHistoryService,
  ) {}

  async list(params: { page: number; pageSize: number; statusId?: string }) {
    const where: Prisma.EntryWhereInput = {
      deletedAt: null,
      ...(params.statusId ? { statusId: params.statusId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.entry.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { contract: { include: { appointment: { include: { customer: true } } } } },
      }),
      this.prisma.entry.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, storeName: item.contract?.appointment?.customer?.corporateName ?? null })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async findOne(id: string) {
    const entry = await this.prisma.entry.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { include: { appointment: { include: { customer: true } } } } },
    });
    if (!entry) throw new NotFoundException('エントリー案件が見つかりません');
    return { ...entry, storeName: entry.contract?.appointment?.customer?.corporateName ?? null };
  }

  /** 初期実装は1成約につき最新1件のエントリーを管理する(セクション27、複数エントリー対応は将来拡張) */
  async create(dto: CreateEntryDto, userId: string) {
    const statusId = dto.statusId ?? (await this.statusResolver.resolveId('ENTRY', 'NOT_ENTERED'));
    const caseNumber = await this.sequence.nextCaseNumber('ENTRY');
    const contract = await this.prisma.contract.findUniqueOrThrow({ where: { id: dto.contractId } });
    const entry = await this.prisma.entry.create({
      data: {
        caseNumber,
        caseName: contract.caseName,
        contractId: dto.contractId,
        entryUserId: dto.entryUserId,
        statusId,
        applicationNumber: dto.applicationNumber,
      },
    });
    await this.prisma.contract.update({
      where: { id: dto.contractId },
      data: { entryStatusId: statusId },
    });
    return entry;
  }

  async update(id: string, dto: UpdateEntryDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }

    const { version, entryAt, resolvedAt, approvedAt, corporateName, ...rest } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (corporateName !== undefined) {
        const customerId = existing.contract?.appointment?.customerId;
        if (customerId) {
          await tx.customer.update({
            where: { id: customerId },
            data: { corporateName, updatedBy: userId, version: { increment: 1 } },
          });
        } else if (existing.contract?.appointment) {
          const customer = await tx.customer.create({ data: { corporateName, createdBy: userId, updatedBy: userId } });
          await tx.appointment.update({ where: { id: existing.contract.appointment.id }, data: { customerId: customer.id } });
        }
      }

      const result = await tx.entry.updateMany({
        where: { id, version },
        data: {
          ...rest,
          entryAt: entryAt ? new Date(entryAt) : undefined,
          resolvedAt: resolvedAt ? new Date(resolvedAt) : undefined,
          approvedAt: approvedAt ? new Date(approvedAt) : undefined,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
      const entry = await tx.entry.findUniqueOrThrow({ where: { id } });
      if (dto.statusId) {
        await tx.contract.update({ where: { id: entry.contractId }, data: { entryStatusId: dto.statusId } });
      }
      return entry;
    });

    await this.caseHistory.recordDiff('ENTRY', id, existing, updated, userId);
    return updated;
  }
}
