import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import { ArriveVisitDto, StartMeetingDto, EndMeetingDto, OfflineActionItemDto } from './dto/mobile-visit.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { distanceInMeters } from '../common/utils/geo.util';
import { AppointmentsService } from '../appointments/appointments.service';
import { RealtimeService } from '../realtime/realtime.service';

const DEFAULT_ARRIVAL_WARNING_METERS = 500;

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly appointments: AppointmentsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(params: { page: number; pageSize: number; statusId?: string; userId?: string; dateFrom?: string; dateTo?: string }) {
    const where: Prisma.VisitWhereInput = {
      deletedAt: null,
      ...(params.statusId ? { statusId: params.statusId } : {}),
      ...(params.userId ? { fieldSalesUserId: params.userId } : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            scheduledAt: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.visit.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { scheduledAt: 'asc' },
        include: { appointment: { include: { customer: true } }, meetingSession: true },
      }),
      this.prisma.visit.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, storeName: item.appointment?.customer?.corporateName ?? null })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async findOne(id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, deletedAt: null },
      include: {
        meetingSession: true,
        statusHistory: { orderBy: { changedAt: 'desc' } },
        appointment: { include: { customer: true } },
      },
    });
    if (!visit) throw new NotFoundException('訪問案件が見つかりません');
    return { ...visit, storeName: visit.appointment?.customer?.corporateName ?? null };
  }

  async create(dto: CreateVisitDto, userId: string) {
    const statusId = await this.statusResolver.resolveId('VISIT', 'VISIT_SCHEDULED');
    const caseNumber = await this.sequence.nextCaseNumber('VISIT');
    const appointment = await this.prisma.appointment.findUniqueOrThrow({ where: { id: dto.appointmentId } });
    return this.prisma.visit.create({
      data: {
        caseNumber,
        caseName: appointment.caseName,
        appointmentId: dto.appointmentId,
        visitKind: dto.visitKind ?? 'INITIAL',
        fieldSalesUserId: dto.fieldSalesUserId,
        scheduledAt: new Date(dto.scheduledAt),
        statusId,
      },
    });
  }

  async update(id: string, dto: UpdateVisitDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }
    const { version, scheduledAt, corporateName, ...rest } = dto;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      const result = await tx.visit.updateMany({
        where: { id, version },
        data: {
          ...rest,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');

      if (dto.statusId && dto.statusId !== existing.statusId) {
        await tx.visitStatusHistory.create({
          data: { visitId: id, fromStatusId: existing.statusId, toStatusId: dto.statusId, changedBy: userId },
        });
      }
      return tx.visit.findUniqueOrThrow({ where: { id } });
    });
  }

  // ============================================================
  // Phase6: モバイル訪問営業
  // ============================================================

  private async getArrivalWarningDistance(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'arrivalWarningDistanceMeters' } });
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_ARRIVAL_WARNING_METERS;
  }

  /** 本日の訪問予定(訪問予定時刻順、セクション16) */
  async mobileHome(userId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const visits = await this.prisma.visit.findMany({
      where: {
        deletedAt: null,
        fieldSalesUserId: userId,
        scheduledAt: { gte: startOfDay, lte: endOfDay },
      },
      orderBy: { scheduledAt: 'asc' },
      include: { appointment: { include: { customer: true } } },
    });
    return visits;
  }

  async todayVisits(userId: string) {
    return this.mobileHome(userId);
  }

  async upcomingVisits(userId: string) {
    return this.prisma.visit.findMany({
      where: { deletedAt: null, fieldSalesUserId: userId, scheduledAt: { gte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
      include: { appointment: { include: { customer: true } } },
    });
  }

  /** 訪問到着ボタン(セクション18)。GPS拒否/取得失敗時も登録は可能。距離超過時は理由入力で登録可能。 */
  async arrive(id: string, dto: ArriveVisitDto, userId: string, ip?: string) {
    const visit = await this.findOne(id);
    const arrivedStatusId = await this.statusResolver.resolveId('VISIT', 'VISIT_ARRIVED');

    let distanceFromDestination: number | null = null;
    let warning = false;
    if (dto.latitude != null && dto.longitude != null && visit.destinationLatitude != null && visit.destinationLongitude != null) {
      distanceFromDestination = distanceInMeters(
        dto.latitude,
        dto.longitude,
        visit.destinationLatitude,
        visit.destinationLongitude,
      );
      const threshold = await this.getArrivalWarningDistance();
      warning = distanceFromDestination > threshold;
      if (warning && !dto.comment) {
        // 警告時、理由未入力でも登録自体は許可する(セクション18)。ここではフラグのみ返却する。
      }
    }

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.visit.update({
        where: { id },
        data: {
          statusId: arrivedStatusId,
          arrivedAt: new Date(),
          arrivedByUserId: userId,
          arrivedLatitude: dto.latitude,
          arrivedLongitude: dto.longitude,
          arrivedAccuracy: dto.accuracy,
          arrivedDistanceFromDestination: distanceFromDestination ?? undefined,
          arrivedDeviceInfo: dto.deviceInfo,
          arrivedIpAddress: ip,
          arrivedComment: dto.comment,
          locationPermissionStatus: dto.locationPermissionStatus ?? (dto.latitude != null ? 'GRANTED' : 'FAILED'),
          version: { increment: 1 },
        },
      });
      await tx.visitStatusHistory.create({
        data: { visitId: id, fromStatusId: visit.statusId, toStatusId: arrivedStatusId, changedBy: userId },
      });
      if (dto.latitude != null && dto.longitude != null) {
        await tx.locationRecord.create({
          data: {
            visitId: id,
            eventType: 'ARRIVE',
            latitude: dto.latitude,
            longitude: dto.longitude,
            accuracy: dto.accuracy,
            userId,
          },
        });
      }
      return tx.visit.findUniqueOrThrow({ where: { id } });
    });

    this.realtime.emitCaseUpdated(['company:default', `visit:${id}`, ...(visit.fieldSalesUserId ? [`user:${visit.fieldSalesUserId}`] : [])], {
      entityType: 'VISIT',
      id,
      version: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
      updatedBy: userId,
      action: 'updated',
    });

    return { visit: updated, warning, distanceFromDestination };
  }

  /** 商談開始(=商談中)ボタン(セクション19) */
  async startMeeting(id: string, dto: StartMeetingDto, userId: string) {
    const visit = await this.findOne(id);
    const arrivedInternalCode = await this.statusResolver.internalCodeOf(visit.statusId);

    if (arrivedInternalCode !== 'VISIT_ARRIVED' && !dto.alsoRegisterArrival) {
      throw new BadRequestException(
        '訪問到着が未登録です。到着と商談開始を同時登録する場合はalsoRegisterArrival=trueを指定してください。',
      );
    }

    const inMeetingStatusId = await this.statusResolver.resolveId('VISIT', 'MEETING_IN_PROGRESS');
    const now = new Date();
    const arrivedAt = visit.arrivedAt ?? (dto.alsoRegisterArrival ? now : null);
    const waitingMinutes = arrivedAt ? Math.max(0, Math.round((now.getTime() - arrivedAt.getTime()) / 60000)) : null;

    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (!visit.arrivedAt && dto.alsoRegisterArrival) {
        const arrivedStatusId = await this.statusResolver.resolveId('VISIT', 'VISIT_ARRIVED');
        await tx.visit.update({
          where: { id },
          data: { arrivedAt: now, arrivedByUserId: userId, statusId: arrivedStatusId, version: { increment: 1 } },
        });
      }

      await tx.visit.update({
        where: { id },
        data: { statusId: inMeetingStatusId, version: { increment: 1 } },
      });
      await tx.visitStatusHistory.create({
        data: { visitId: id, fromStatusId: visit.statusId, toStatusId: inMeetingStatusId, changedBy: userId },
      });
      await tx.meetingSession.upsert({
        where: { visitId: id },
        update: {
          meetingStartedAt: now,
          meetingStartedByUserId: userId,
          meetingStartLatitude: dto.latitude,
          meetingStartLongitude: dto.longitude,
          waitingMinutes,
        },
        create: {
          visitId: id,
          meetingStartedAt: now,
          meetingStartedByUserId: userId,
          meetingStartLatitude: dto.latitude,
          meetingStartLongitude: dto.longitude,
          waitingMinutes,
        },
      });
      // アポ案件の商談ステータスも同期更新(セクション19)
      const v = await tx.visit.findUniqueOrThrow({ where: { id } });
      const apoInMeetingStatusId = await this.statusResolver.resolveId('APPOINTMENT', 'APO_IN_MEETING');
      await tx.appointment.update({
        where: { id: v.appointmentId },
        data: { meetingStatusId: apoInMeetingStatusId },
      });

      return tx.visit.findUniqueOrThrow({ where: { id }, include: { meetingSession: true } });
    });

    this.realtime.emitCaseUpdated(['company:default', `visit:${id}`], {
      entityType: 'VISIT',
      id,
      version: result.version,
      updatedAt: result.updatedAt.toISOString(),
      updatedBy: userId,
      action: 'updated',
    });

    return result;
  }

  /** 商談終了ボタン(セクション20)。成約の場合は成約管理へ自動移行(Appointment更新経由でトリガー)。 */
  async endMeeting(id: string, dto: EndMeetingDto, userId: string) {
    const visit = await this.findOne(id);
    const completedStatusId = await this.statusResolver.resolveId('VISIT', 'MEETING_COMPLETED');
    const now = new Date();

    const meetingSession = await this.prisma.meetingSession.findUnique({ where: { visitId: id } });
    const durationMinutes = meetingSession?.meetingStartedAt
      ? Math.max(0, Math.round((now.getTime() - meetingSession.meetingStartedAt.getTime()) / 60000))
      : null;

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.visit.update({
        where: { id },
        data: { statusId: completedStatusId, version: { increment: 1 } },
      });
      await tx.visitStatusHistory.create({
        data: { visitId: id, fromStatusId: visit.statusId, toStatusId: completedStatusId, changedBy: userId },
      });
      await tx.meetingSession.upsert({
        where: { visitId: id },
        update: {
          meetingEndedAt: now,
          meetingEndedByUserId: userId,
          meetingDurationMinutes: durationMinutes,
          meetingResult: dto.meetingResult,
          nextAction: dto.nextAction,
          nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : undefined,
          nextVisitAt: dto.nextVisitAt ? new Date(dto.nextVisitAt) : undefined,
          meetingMemo: dto.meetingMemo,
          customerNeeds: dto.customerNeeds,
          rejectionReason: dto.rejectionReason,
          estimatedContractProbability: dto.estimatedContractProbability,
          contractExpectedDate: dto.contractExpectedDate ? new Date(dto.contractExpectedDate) : undefined,
          meetingEndLatitude: dto.latitude,
          meetingEndLongitude: dto.longitude,
        },
        create: {
          visitId: id,
          meetingEndedAt: now,
          meetingEndedByUserId: userId,
          meetingDurationMinutes: durationMinutes,
          meetingResult: dto.meetingResult,
        },
      });
    });

    // 成約相当の結果の場合、アポ案件のステータスをAPO_CONTRACTEDへ更新し、
    // AppointmentsService.update内の自動移行ロジック(セクション25)を発火させる。
    if (dto.meetingResult === '成約') {
      const v = await this.findOne(id);
      const appointment = await this.prisma.appointment.findUniqueOrThrow({ where: { id: v.appointmentId } });
      const contractedStatusId = await this.statusResolver.resolveId('APPOINTMENT', 'APO_CONTRACTED');
      await this.appointments.update(
        v.appointmentId,
        { version: appointment.version, meetingStatusId: contractedStatusId },
        userId,
      );
    }

    return this.findOne(id);
  }

  /**
   * オフライン操作の一括同期(セクション24)。idempotencyKeyで重複実行を防止する。
   * 実際のarrive/startMeeting/endMeeting処理へディスパッチする軽量ラッパー。
   */
  async syncOfflineActions(items: OfflineActionItemDto[], userId: string) {
    const results: { idempotencyKey: string; status: 'SYNCED' | 'SKIPPED' | 'FAILED'; error?: string }[] = [];

    for (const item of items) {
      const existing = await this.prisma.offlineAction.findUnique({ where: { idempotencyKey: item.idempotencyKey } });
      if (existing?.status === 'SYNCED') {
        results.push({ idempotencyKey: item.idempotencyKey, status: 'SKIPPED' });
        continue;
      }

      const record = await this.prisma.offlineAction.upsert({
        where: { idempotencyKey: item.idempotencyKey },
        update: { retryCount: { increment: 1 } },
        create: {
          idempotencyKey: item.idempotencyKey,
          userId,
          actionType: item.actionType,
          targetEntityId: item.targetEntityId,
          payload: item.payload as Prisma.InputJsonValue,
          capturedAt: new Date(item.capturedAt),
        },
      });

      try {
        if (item.actionType === 'ARRIVE') {
          await this.arrive(item.targetEntityId, item.payload as ArriveVisitDto, userId);
        } else if (item.actionType === 'START_MEETING') {
          await this.startMeeting(item.targetEntityId, item.payload as StartMeetingDto, userId);
        } else if (item.actionType === 'END_MEETING') {
          await this.endMeeting(item.targetEntityId, item.payload as unknown as EndMeetingDto, userId);
        }
        await this.prisma.offlineAction.update({
          where: { id: record.id },
          data: { status: 'SYNCED', syncedAt: new Date() },
        });
        results.push({ idempotencyKey: item.idempotencyKey, status: 'SYNCED' });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.offlineAction.update({ where: { id: record.id }, data: { status: 'FAILED', errorMessage: message } });
        results.push({ idempotencyKey: item.idempotencyKey, status: 'FAILED', error: message });
      }
    }

    return { results };
  }
}
