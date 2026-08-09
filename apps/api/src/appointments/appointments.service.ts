import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateAppointmentDto } from './dto/appointment.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { ContractsService } from '../contracts/contracts.service';
import { RealtimeService } from '../realtime/realtime.service';
import { toDateOrUndefined } from '../common/utils/date.util';
import { extractPrefecture } from '../common/utils/prefecture.util';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly caseHistory: CaseHistoryService,
    private readonly contracts: ContractsService,
    private readonly realtime: RealtimeService,
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
      ...(params.keyword
        ? {
            OR: [
              { caseNumber: { contains: params.keyword, mode: 'insensitive' } },
              { customer: { is: { corporateName: { contains: params.keyword, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.appointment.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        // 商談日時が近い順に上から並べる(未設定は末尾)。要望: 商談日時順で自動並び替え。
        orderBy: [{ meetingStartAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        include: { customer: true, contract: { select: { id: true, caseNumber: true } } },
      }),
      this.prisma.appointment.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        storeName: item.customer?.corporateName ?? null,
        prefecture: extractPrefecture(item.customer?.address),
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, deletedAt: null },
      include: { visits: true, contract: true, customer: true },
    });
    if (!appointment) throw new NotFoundException('アポ案件が見つかりません');
    return { ...appointment, storeName: appointment.customer?.corporateName ?? null, prefecture: extractPrefecture(appointment.customer?.address) };
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
    // トスから入ってきたアポ案件の進捗初期値は新規訪問で統一する(要望)
    const progressStatusId = await this.statusResolver.resolveId('APPOINTMENT_PROGRESS', 'PROG_NEW_VISIT');
    // 案件番号・案件名はトス案件からそのまま引き継ぐ(要望: トス/アポ/成約で番号・名称を統一する)

    try {
      const appointment = await this.prisma.appointment.create({
        data: {
          caseNumber: tossCase.caseNumber,
          caseName: tossCase.caseName,
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
          progressStatusId,
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

    const {
      version,
      meetingStartAt,
      meetingEndAt,
      nextActionAt,
      importantMattersOkAt,
      electronicContractAt,
      deliveredAt,
      corporateName,
      contactName,
      phone,
      address,
      email,
      ...rest
    } = dto;

    const hasCustomerChanges =
      corporateName !== undefined || contactName !== undefined || phone !== undefined || address !== undefined || email !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      let customerId = existing.customerId;
      if (hasCustomerChanges) {
        if (customerId) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              ...(corporateName !== undefined ? { corporateName } : {}),
              ...(contactName !== undefined ? { contactName } : {}),
              ...(phone !== undefined ? { phone } : {}),
              ...(address !== undefined ? { address } : {}),
              ...(email !== undefined ? { email } : {}),
              updatedBy: userId,
              version: { increment: 1 },
            },
          });
        } else {
          const customer = await tx.customer.create({
            data: { corporateName, contactName, phone, address, email, createdBy: userId, updatedBy: userId },
          });
          customerId = customer.id;
        }
      }

      const result = await tx.appointment.updateMany({
        where: { id, version },
        data: {
          ...rest,
          ...(hasCustomerChanges && !existing.customerId ? { customerId } : {}),
          meetingStartAt: toDateOrUndefined(meetingStartAt),
          meetingEndAt: toDateOrUndefined(meetingEndAt),
          nextActionAt: toDateOrUndefined(nextActionAt),
          importantMattersOkAt: toDateOrUndefined(importantMattersOkAt),
          electronicContractAt: toDateOrUndefined(electronicContractAt),
          deliveredAt: toDateOrUndefined(deliveredAt),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
      return tx.appointment.findUniqueOrThrow({ where: { id }, include: { customer: true } });
    });

    await this.caseHistory.recordDiff('APPOINTMENT', id, existing, updated, userId);

    this.realtime.emitCaseUpdated(
      [
        'company:default',
        ...(updated.snapshotDepartmentId ? [`department:${updated.snapshotDepartmentId}`] : []),
        ...(updated.snapshotTeamId ? [`team:${updated.snapshotTeamId}`] : []),
        `appointment:${id}`,
      ],
      {
        entityType: 'APPOINTMENT',
        id,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
        updatedBy: userId,
        action: 'updated',
      },
    );

    // 進捗がET(PROG_ET)に変わった場合、ET管理へ自動移行(セクション追加要望)
    if (dto.progressStatusId && dto.progressStatusId !== existing.progressStatusId) {
      const internalCode = await this.statusResolver.internalCodeOf(dto.progressStatusId);
      if (internalCode === 'PROG_ET') {
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
