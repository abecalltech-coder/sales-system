import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAppointmentDto } from './dto/appointment.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { ContractsService } from '../contracts/contracts.service';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly caseHistory: CaseHistoryService,
    private readonly contracts: ContractsService,
  ) {}

  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    statusId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
      ...(params.statusId ? { meetingStatusId: params.statusId } : {}),
      ...(params.userId
        ? { OR: [{ apoUserId: params.userId }, { meetingUserId: params.userId }, { fieldSalesUserId: params.userId }] }
        : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            meetingStartAt: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
            },
          }
        : {}),
      ...(params.keyword ? { caseNumber: { contains: params.keyword, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { meetingStartAt: 'asc' },
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: { visits: true, contract: true },
    });
    if (!appointment) throw new NotFoundException('アポ案件が見つかりません');
    return appointment;
  }

  /**
   * トス案件のステータスがTOSS_APPOINTMENTになった際の自動移行(セクション10)。
   * idempotencyKey = tossCaseId により二重作成を防止する。
   * Googleカレンダー/Meet連携はPhase5でWorkerジョブとして実装するため、
   * ここではcalendarSyncStatus=NOT_SYNCEDのまま作成する。
   */
  async createFromTossAutomation(tossCaseId: string, actorUserId?: string) {
    const existing = await this.prisma.appointment.findUnique({ where: { tossCaseId } });
    if (existing) return existing; // 冪等: 既に作成済みなら何もしない

    const tossCase = await this.prisma.tossCase.findUniqueOrThrow({ where: { id: tossCaseId } });
    const meetingStatusId = await this.statusResolver.resolveId('APPOINTMENT', 'APO_CONFIRMED');
    const caseNumber = await this.sequence.nextCaseNumber('APPOINTMENT');

    try {
      const appointment = await this.prisma.appointment.create({
        data: {
          caseNumber,
          tossCaseId,
          customerId: tossCase.customerId,
          snapshotDepartmentId: tossCase.snapshotDepartmentId,
          snapshotTeamId: tossCase.snapshotTeamId,
          apoUserId: tossCase.tossUserId,
          meetingUserId: tossCase.salesUserId,
          fieldSalesUserId: tossCase.fieldSalesUserId,
          meetingStartAt: tossCase.confirmedStartAt,
          meetingEndAt: tossCase.confirmedEndAt,
          visitAddress: undefined,
          meetingStatusId,
          idempotencyKey: tossCaseId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      await this.caseHistory.record({
        entityType: 'APPOINTMENT',
        entityId: appointment.id,
        field: 'created',
        before: null,
        after: { fromTossCaseId: tossCaseId },
        changedBy: actorUserId,
      });
      return appointment;
    } catch (err) {
      // 一意制約違反(並行実行での二重作成)は既存レコードを返して冪等性を保つ
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Appointment already exists for tossCaseId=${tossCaseId} (race condition handled)`);
        return this.prisma.appointment.findUniqueOrThrow({ where: { tossCaseId } });
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateAppointmentDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }

    const { version, meetingStartAt, meetingEndAt, nextActionAt, ...rest } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appointment.updateMany({
        where: { id, version },
        data: {
          ...rest,
          meetingStartAt: meetingStartAt ? new Date(meetingStartAt) : undefined,
          meetingEndAt: meetingEndAt ? new Date(meetingEndAt) : undefined,
          nextActionAt: nextActionAt ? new Date(nextActionAt) : undefined,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
      return tx.appointment.findUniqueOrThrow({ where: { id } });
    });

    await this.caseHistory.recordDiff('APPOINTMENT', id, existing, updated, userId);

    // ステータスが成約(APO_CONTRACTED)に変わった場合、成約管理へ自動移行(セクション25)
    if (dto.meetingStatusId && dto.meetingStatusId !== existing.meetingStatusId) {
      const internalCode = await this.statusResolver.internalCodeOf(dto.meetingStatusId);
      if (internalCode === 'APO_CONTRACTED') {
        await this.contracts.createFromAppointmentAutomation(id, userId);
      }
    }

    return updated;
  }

  /** Googleカレンダー連携の再実行(Phase5でWorkerジョブとして実装。ここではステータスのみ更新可能にしておく) */
  async retryCalendarSync(id: string) {
    await this.findOne(id);
    await this.prisma.appointment.update({
      where: { id },
      data: { calendarSyncStatus: 'SYNCING', calendarSyncError: null },
    });
    return { ok: true, message: 'カレンダー再連携ジョブをキューへ投入しました(Phase5実装予定)' };
  }
}
