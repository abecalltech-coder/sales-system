import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateContractDto } from './dto/contract.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { RealtimeService } from '../realtime/realtime.service';
import { toDateOrUndefined } from '../common/utils/date.util';

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly caseHistory: CaseHistoryService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(params: { page: number; pageSize: number; keyword?: string; statusId?: string }) {
    const where: Prisma.ContractWhereInput = {
      deletedAt: null,
      ...(params.statusId ? { matchingStatusId: params.statusId } : {}),
      ...(params.keyword
        ? {
            OR: [
              { caseNumber: { contains: params.keyword, mode: 'insensitive' } },
              { appointment: { is: { customer: { is: { corporateName: { contains: params.keyword, mode: 'insensitive' } } } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contract.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { appointment: { include: { customer: true } } },
      }),
      this.prisma.contract.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, storeName: item.appointment?.customer?.corporateName ?? null })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: { entries: true, appointment: { include: { customer: true } } },
    });
    if (!contract) throw new NotFoundException('成約案件が見つかりません');
    return { ...contract, storeName: contract.appointment?.customer?.corporateName ?? null };
  }

  /** アポ案件の商談結果が成約になった際の自動移行(セクション25)。appointmentIdのunique制約で二重作成防止。 */
  async createFromAppointmentAutomation(appointmentId: string, actorUserId?: string) {
    const existing = await this.prisma.contract.findUnique({ where: { appointmentId } });
    if (existing) return existing;

    const appointment = await this.prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const matchingStatusId = await this.statusResolver.resolveId('MATCHING', 'NOT_HANDLED');
    // 案件番号・案件名はアポ案件からそのまま引き継ぐ(要望: トス/アポ/成約で番号・名称を統一する)

    try {
      const contract = await this.prisma.contract.create({
        data: {
          caseNumber: appointment.caseNumber,
          caseName: appointment.caseName,
          appointmentId,
          tossCaseId: appointment.tossCaseId,
          contractUserId: appointment.meetingUserId ?? appointment.fieldSalesUserId,
          matchingStatusId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      await this.caseHistory.record({
        entityType: 'CONTRACT',
        entityId: contract.id,
        field: 'created',
        before: null,
        after: { fromAppointmentId: appointmentId },
        changedBy: actorUserId,
      });
      return contract;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Contract already exists for appointmentId=${appointmentId} (race condition handled)`);
        return this.prisma.contract.findUniqueOrThrow({ where: { appointmentId } });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateContractDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }

    const { version, contractedAt, matchingAt, switchingScheduledAt, switchingAt, cancelledAt, terminatedAt, nextActionAt, corporateName, ...rest } =
      dto;

    // マッチング完了/スイッチング完了へ変更した際、日付が空欄なら現在日を自動入力する(セクション26)
    let resolvedMatchingAt = matchingAt ? new Date(matchingAt) : existing.matchingAt ?? undefined;
    let resolvedSwitchingAt = switchingAt ? new Date(switchingAt) : existing.switchingAt ?? undefined;

    if (dto.matchingStatusId && dto.matchingStatusId !== existing.matchingStatusId) {
      const internalCode = await this.statusResolver.internalCodeOf(dto.matchingStatusId);
      if (internalCode === 'MATCHING_COMPLETED' && !resolvedMatchingAt) {
        resolvedMatchingAt = new Date();
      }
      if (internalCode === 'SWITCHING_COMPLETED' && !resolvedSwitchingAt) {
        resolvedSwitchingAt = new Date();
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (corporateName !== undefined) {
        const customerId = existing.appointment?.customerId;
        if (customerId) {
          await tx.customer.update({
            where: { id: customerId },
            data: { corporateName, updatedBy: userId, version: { increment: 1 } },
          });
        } else if (existing.appointment) {
          const customer = await tx.customer.create({ data: { corporateName, createdBy: userId, updatedBy: userId } });
          await tx.appointment.update({ where: { id: existing.appointment.id }, data: { customerId: customer.id } });
        }
      }

      const result = await tx.contract.updateMany({
        where: { id, version },
        data: {
          ...rest,
          contractedAt: toDateOrUndefined(contractedAt),
          matchingAt: resolvedMatchingAt,
          switchingScheduledAt: toDateOrUndefined(switchingScheduledAt),
          switchingAt: resolvedSwitchingAt,
          cancelledAt: toDateOrUndefined(cancelledAt),
          terminatedAt: toDateOrUndefined(terminatedAt),
          nextActionAt: toDateOrUndefined(nextActionAt),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
      return tx.contract.findUniqueOrThrow({ where: { id } });
    });

    await this.caseHistory.recordDiff('CONTRACT', id, existing, updated, userId);

    this.realtime.emitCaseUpdated(['company:default', `contract:${id}`], {
      entityType: 'CONTRACT',
      id,
      version: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
      updatedBy: userId,
      action: 'updated',
    });

    return updated;
  }
}
