import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTossCaseDto, UpdateTossCaseDto, BulkUpdateTossCaseDto } from './dto/toss-case.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { RealtimeService } from '../realtime/realtime.service';
import { extractPrefecture } from '../common/utils/prefecture.util';
import { toDateOrUndefined } from '../common/utils/date.util';

@Injectable()
export class TossCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly caseHistory: CaseHistoryService,
    private readonly appointments: AppointmentsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    statusId?: string;
    departmentId?: string;
    teamId?: string;
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const where: Prisma.TossCaseWhereInput = {
      deletedAt: null,
      ...(params.statusId ? { statusId: params.statusId } : {}),
      ...(params.departmentId ? { snapshotDepartmentId: params.departmentId } : {}),
      ...(params.teamId ? { snapshotTeamId: params.teamId } : {}),
      ...(params.userId
        ? { OR: [{ tossUserId: params.userId }, { salesUserId: params.userId }, { fieldSalesUserId: params.userId }] }
        : {}),
      ...(params.dateFrom || params.dateTo
        ? {
            receivedAt: {
              ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
              ...(params.dateTo ? { lte: new Date(params.dateTo) } : {}),
            },
          }
        : {}),
      ...(params.keyword
        ? {
            OR: [
              { caseNumber: { contains: params.keyword, mode: 'insensitive' } },
              { caseName: { contains: params.keyword, mode: 'insensitive' } },
              { memo: { contains: params.keyword, mode: 'insensitive' } },
              { customer: { is: { corporateName: { contains: params.keyword, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tossCase.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        // 次回対応日時が近い順に上から並べる(未設定は末尾)。要望: 次回対応日時順で自動並び替え。
        orderBy: [{ nextActionAt: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'desc' }],
        include: { customer: true, appointment: { select: { id: true, caseNumber: true } } },
      }),
      this.prisma.tossCase.count({ where }),
    ]);
    return {
      items: items.map((item) => ({ ...item, prefecture: extractPrefecture(item.customer?.address) })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async findOne(id: string) {
    const tossCase = await this.prisma.tossCase.findFirst({
      where: { id, deletedAt: null },
      include: { customer: true, appointment: true },
    });
    if (!tossCase) throw new NotFoundException('トス案件が見つかりません');
    return { ...tossCase, prefecture: extractPrefecture(tossCase.customer?.address) };
  }

  /** 手動登録(セクション9)。顧客が未指定なら簡易情報からその場で作成する。 */
  async create(dto: CreateTossCaseDto, actorUserId: string) {
    const statusId = dto.statusId ?? (await this.statusResolver.resolveId('TOSS', 'TOSS_NEW'));

    if (dto.address && !extractPrefecture(dto.address)) {
      throw new BadRequestException('住所は都道府県から入力してください');
    }

    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId } });

    let customerId = dto.customerId;
    if (!customerId && (dto.corporateName || dto.phone || dto.email || dto.address || dto.contactName)) {
      const customer = await this.prisma.customer.create({
        data: {
          corporateName: dto.corporateName,
          contactName: dto.contactName,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          postalCode: dto.postalCode,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        },
      });
      customerId = customer.id;
    }

    const caseNumber = await this.sequence.nextCaseNumber('TOSS');
    const tossCase = await this.prisma.tossCase.create({
      data: {
        caseNumber,
        caseName: dto.caseName ?? dto.corporateName,
        customerId,
        productId: dto.productId,
        sourceId: dto.sourceId,
        // 案件作成時点の所属をスナップショットとして保存(異動後も当時集計できるように)
        snapshotDepartmentId: actor.departmentId,
        snapshotTeamId: actor.teamId,
        tossUserId: dto.tossUserId ?? actorUserId,
        salesUserId: dto.salesUserId,
        fieldSalesUserId: dto.fieldSalesUserId,
        desiredAt: dto.desiredAt ? new Date(dto.desiredAt) : undefined,
        statusId,
        memo: dto.memo,
        tags: dto.tags ?? [],
        apStaffName: dto.apStaffName,
        department: dto.department,
        proposal: dto.proposal,
        listName: dto.listName,
        callDirection: dto.callDirection,
        industry: dto.industry,
        hook: dto.hook,
        existingContract: dto.existingContract,
        preConfirmStatusId: dto.preConfirmStatusId,
        progressStatusId: dto.progressStatusId,
        ngReasonStatusId: dto.ngReasonStatusId,
        nextActionAt: dto.nextActionAt ? new Date(dto.nextActionAt) : undefined,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });

    this.realtime.emitCaseUpdated(
      [
        'company:default',
        ...(tossCase.snapshotDepartmentId ? [`department:${tossCase.snapshotDepartmentId}`] : []),
        ...(tossCase.snapshotTeamId ? [`team:${tossCase.snapshotTeamId}`] : []),
      ],
      {
        entityType: 'TOSS_CASE',
        id: tossCase.id,
        version: tossCase.version,
        updatedAt: tossCase.updatedAt.toISOString(),
        updatedBy: actorUserId,
        action: 'created',
      },
    );

    return tossCase;
  }

  async update(id: string, dto: UpdateTossCaseDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }

    const {
      version,
      desiredAt,
      confirmedStartAt,
      confirmedEndAt,
      nextActionAt,
      corporateName,
      contactName,
      phone,
      address,
      postalCode,
      ...rest
    } = dto;

    if (address && !extractPrefecture(address)) {
      throw new BadRequestException('住所は都道府県から入力してください');
    }

    const hasCustomerChanges =
      corporateName !== undefined || contactName !== undefined || phone !== undefined || address !== undefined || postalCode !== undefined;

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
              ...(postalCode !== undefined ? { postalCode } : {}),
              updatedBy: userId,
              version: { increment: 1 },
            },
          });
        } else {
          const customer = await tx.customer.create({
            data: { corporateName, contactName, phone, address, postalCode, createdBy: userId, updatedBy: userId },
          });
          customerId = customer.id;
        }
      }

      const result = await tx.tossCase.updateMany({
        where: { id, version },
        data: {
          ...rest,
          ...(hasCustomerChanges && !existing.customerId ? { customerId } : {}),
          desiredAt: toDateOrUndefined(desiredAt),
          confirmedStartAt: toDateOrUndefined(confirmedStartAt),
          confirmedEndAt: toDateOrUndefined(confirmedEndAt),
          nextActionAt: toDateOrUndefined(nextActionAt),
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
      return tx.tossCase.findUniqueOrThrow({ where: { id }, include: { customer: true } });
    });

    await this.caseHistory.recordDiff('TOSS_CASE', id, existing, updated, userId);

    this.realtime.emitCaseUpdated(
      [
        'company:default',
        ...(updated.snapshotDepartmentId ? [`department:${updated.snapshotDepartmentId}`] : []),
        ...(updated.snapshotTeamId ? [`team:${updated.snapshotTeamId}`] : []),
        `toss:${id}`,
      ],
      {
        entityType: 'TOSS_CASE',
        id,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
        updatedBy: userId,
        action: 'updated',
      },
    );

    // ステータスがTOSS_APPOINTMENTに変わった場合、アポ案件へ自動移行する(セクション10)。
    // ステータス変更自体は上のトランザクションで確定済み。アポ作成が失敗しても
    // トス側の状態はロールバックせず、Appointment側でエラーとして扱う設計とする。
    if (dto.statusId && dto.statusId !== existing.statusId) {
      const internalCode = await this.statusResolver.internalCodeOf(dto.statusId);
      if (internalCode === 'TOSS_APPOINTMENT') {
        await this.appointments.createFromTossAutomation(id, userId);
      }
    }

    return updated;
  }

  async bulkUpdate(dto: BulkUpdateTossCaseDto, userId: string) {
    const result = await this.prisma.tossCase.updateMany({
      where: { id: { in: dto.ids }, deletedAt: null },
      data: {
        statusId: dto.statusId,
        salesUserId: dto.salesUserId,
        updatedBy: userId,
        version: { increment: 1 },
      },
    });

    // 一括でTOSS_APPOINTMENTへ変更した場合も自動移行を発火させる
    if (dto.statusId) {
      const internalCode = await this.statusResolver.internalCodeOf(dto.statusId);
      if (internalCode === 'TOSS_APPOINTMENT') {
        for (const id of dto.ids) {
          await this.appointments.createFromTossAutomation(id, userId);
        }
      }
    }

    return { updatedCount: result.count };
  }

  async softDelete(id: string, userId: string) {
    await this.prisma.tossCase.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return { ok: true };
  }

  /**
   * 対応中フラグ(架電中ボタン)の切替。二重架電防止のための全員共有フラグであり、
   * 他フィールドの編集とは独立させるため楽観ロック(version)の対象にはしない。
   */
  async setCallingFlag(id: string, active: boolean, userId: string) {
    await this.findOne(id);
    const updated = await this.prisma.tossCase.update({
      where: { id },
      data: {
        isCallingInProgress: active,
        callingByUserId: active ? userId : null,
        callingStartedAt: active ? new Date() : null,
      },
    });

    this.realtime.emitCaseUpdated(
      [
        'company:default',
        ...(updated.snapshotDepartmentId ? [`department:${updated.snapshotDepartmentId}`] : []),
        ...(updated.snapshotTeamId ? [`team:${updated.snapshotTeamId}`] : []),
        `toss:${id}`,
      ],
      {
        entityType: 'TOSS_CASE',
        id,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
        updatedBy: userId,
        action: 'updated',
      },
    );

    return updated;
  }
}
