import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { ContractsService } from '../contracts/contracts.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SystemSettingsService } from '../system-settings/system-settings.module';
import { toDateOrUndefined } from '../common/utils/date.util';
import { extractPrefecture } from '../common/utils/prefecture.util';
import { buildCalendarTitle, formatJaDateTimeWithWeekday, renderTemplate } from './toss-appointment-automation.util';

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
    private readonly systemSettings: SystemSettingsService,
  ) {}

  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    statusId?: string;
    userId?: string;
    departmentId?: string;
    closerStatusId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    // 複数条件をAND配列で明示的に結合する(各条件が個別にOR句を持ちうるため、
    // 同じwhereオブジェクトに複数のORキーを直接spreadすると後勝ちで上書きされてしまう)。
    const andConditions: Prisma.AppointmentWhereInput[] = [];
    if (params.statusId) andConditions.push({ meetingStatusId: params.statusId });
    if (params.departmentId) andConditions.push({ snapshotDepartmentId: params.departmentId });
    if (params.closerStatusId) andConditions.push({ closerStatusId: params.closerStatusId });
    if (params.userId) {
      andConditions.push({ OR: [{ apoUserId: params.userId }, { meetingUserId: params.userId }, { fieldSalesUserId: params.userId }] });
    }
    if (params.dateFrom || params.dateTo) {
      const range = {
        ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
        ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
      };
      // CLカレンダーは商談予定に加え、前連予定(30分ブロック)も表示するため、
      // どちらかが表示範囲に入っていればヒットさせる。
      andConditions.push({ OR: [{ meetingStartAt: range }, { preContactAt: range }] });
    }
    if (params.keyword) {
      andConditions.push({
        OR: [
          { caseNumber: { contains: params.keyword, mode: 'insensitive' } },
          { customer: { is: { corporateName: { contains: params.keyword, mode: 'insensitive' } } } },
        ],
      });
    }
    const where: Prisma.AppointmentWhereInput = {
      deletedAt: null,
      ...(andConditions.length ? { AND: andConditions } : {}),
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
  async createFromTossAutomation(tossCaseId: string, actorUserId?: string, preContactAt?: Date) {
    const existing = await this.prisma.appointment.findUnique({ where: { tossCaseId } });
    if (existing) return existing; // 冪等: 既に作成済みなら何もしない

    const tossCase = await this.prisma.tossCase.findUniqueOrThrow({ where: { id: tossCaseId } });
    const meetingStatusId = await this.statusResolver.resolveId('APPOINTMENT', 'APO_CONFIRMED');
    // トスから入ってきたアポ案件の進捗初期値は新規訪問で統一する(要望)
    const progressStatusId = await this.statusResolver.resolveId('APPOINTMENT_PROGRESS', 'PROG_NEW_VISIT');
    // 案件番号・案件名はトス案件からそのまま引き継ぐ(要望: トス/アポ/成約で番号・名称を統一する)

    const [customer, departmentStatus, hookMap, preConfirmStatus, memoTemplate] = await Promise.all([
      tossCase.customerId ? this.prisma.customer.findUnique({ where: { id: tossCase.customerId } }) : Promise.resolve(null),
      tossCase.department ? this.prisma.statusMaster.findUnique({ where: { id: tossCase.department } }) : Promise.resolve(null),
      tossCase.hook
        ? this.prisma.statusMaster.findUnique({
            where: { category_internalCode: { category: 'TOSS_HOOK_LABEL_MAP', internalCode: tossCase.hook.trim() } },
          })
        : Promise.resolve(null),
      tossCase.preConfirmStatusId ? this.prisma.statusMaster.findUnique({ where: { id: tossCase.preConfirmStatusId } }) : Promise.resolve(null),
      this.systemSettings.getOne('tossAppointmentMemoTemplate'),
    ]);

    const prefecture = extractPrefecture(customer?.address);
    const isShumi = (tossCase.hook ?? '').includes('シュミ');
    const hookLabel = hookMap?.displayName ?? '';

    // カレンダー題名・色は部署(CT/CH東/CH西)+都道府県頭文字+フック変換ラベル+店舗名から自動生成する(要望)。
    // 作成後は自由に編集できる(以降のトス側の変更で自動的に変わることはない)。
    const calendarTitle = buildCalendarTitle({
      departmentLabel: departmentStatus?.displayName ?? '',
      prefecture,
      hookLabel,
      isShumi,
      storeName: customer?.corporateName ?? '(店舗名未設定)',
    });
    const calendarColor = departmentStatus?.color ?? undefined;

    const memo =
      typeof memoTemplate === 'string'
        ? renderTemplate(memoTemplate, {
            acquisitionAngle: hookLabel,
            nextActionAt: formatJaDateTimeWithWeekday(tossCase.nextActionAt),
            meetingAt: formatJaDateTimeWithWeekday(tossCase.confirmedStartAt),
            storeName: customer?.corporateName ?? '',
            address: customer?.address ?? '',
            industry: tossCase.industry ?? '',
            storePhone: customer?.phone ?? '',
            contactName: customer?.contactName ?? '',
            apStaffName: tossCase.apStaffName ?? '',
            preConfirmName: preConfirmStatus?.displayName ?? '',
            listName: tossCase.listName ?? '',
            preContactAt: formatJaDateTimeWithWeekday(preContactAt),
            hook: tossCase.hook ?? '',
            meetingUrl: '',
          })
        : undefined;

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
          preContactAt,
          calendarTitle,
          calendarColor,
          memo,
          // トスとアポで項目名・意味が共通の欄はそのまま引き継ぐ(要望)。
          // ただし備考はトス側の通話メモとアポ側のメモが別用途のため引き継がない(上記テンプレートで別途生成する)
          apStaffName: tossCase.apStaffName,
          department: tossCase.department,
          listName: tossCase.listName,
          industry: tossCase.industry,
          hook: tossCase.hook,
          existingContract: tossCase.existingContract,
          preConfirmStatusId: tossCase.preConfirmStatusId,
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

      // 作成しただけではリアルタイム同期が発火せず、アポ一覧を開いていても
      // 手動リロードしないと表示されなかったため、他の作成/更新系と同様にemitする(要望)
      this.realtime.emitCaseUpdated(
        [
          'company:default',
          ...(appointment.snapshotDepartmentId ? [`department:${appointment.snapshotDepartmentId}`] : []),
          `appointment:${appointment.id}`,
        ],
        {
          entityType: 'APPOINTMENT',
          id: appointment.id,
          version: appointment.version,
          updatedAt: appointment.updatedAt.toISOString(),
          updatedBy: actorUserId,
          action: 'created',
        },
      );

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

  /** CLカレンダーから直接予定を作成する(トス経由の自動作成ルートとは別、セクション追加要望) */
  async create(dto: CreateAppointmentDto, userId: string) {
    const caseNumber = await this.sequence.nextCaseNumber('APPOINTMENT');
    const meetingStatusId = await this.statusResolver.resolveId('APPOINTMENT', 'APO_CONFIRMED');

    let customerId: string | undefined;
    if (dto.corporateName) {
      const customer = await this.prisma.customer.create({
        data: { corporateName: dto.corporateName, createdBy: userId, updatedBy: userId },
      });
      customerId = customer.id;
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        caseNumber,
        customerId,
        snapshotDepartmentId: dto.snapshotDepartmentId,
        meetingUserId: dto.meetingUserId,
        fieldSalesUserId: dto.fieldSalesUserId,
        closerStatusId: dto.closerStatusId,
        meetingStartAt: new Date(dto.meetingStartAt),
        meetingEndAt: dto.meetingEndAt ? new Date(dto.meetingEndAt) : undefined,
        meetingType: dto.meetingType,
        visitAddress: dto.visitAddress,
        calendarColor: dto.calendarColor,
        reminderEnabled: dto.reminderEnabled,
        reminderMinutesBefore: dto.reminderMinutesBefore,
        memo: dto.memo,
        meetingStatusId,
        idempotencyKey: randomUUID(),
        createdBy: userId,
        updatedBy: userId,
      },
      include: { customer: true },
    });

    await this.caseHistory.record({
      entityType: 'APPOINTMENT',
      entityId: appointment.id,
      field: 'created',
      before: null,
      after: { source: 'CL_CALENDAR' },
      changedBy: userId,
    });

    this.realtime.emitCaseUpdated(
      [
        'company:default',
        ...(appointment.snapshotDepartmentId ? [`department:${appointment.snapshotDepartmentId}`] : []),
        `appointment:${appointment.id}`,
      ],
      {
        entityType: 'APPOINTMENT',
        id: appointment.id,
        version: appointment.version,
        updatedAt: appointment.updatedAt.toISOString(),
        updatedBy: userId,
        action: 'created',
      },
    );

    return { ...appointment, storeName: appointment.customer?.corporateName ?? null, prefecture: extractPrefecture(appointment.customer?.address) };
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
      preContactAt,
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
          preContactAt: toDateOrUndefined(preContactAt),
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
