import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTossCaseDto, UpdateTossCaseDto, BulkUpdateTossCaseDto } from './dto/toss-case.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { AppointmentsService } from '../appointments/appointments.service';

@Injectable()
export class TossCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
    private readonly caseHistory: CaseHistoryService,
    private readonly appointments: AppointmentsService,
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
        orderBy: { receivedAt: 'desc' },
        include: { customer: true },
      }),
      this.prisma.tossCase.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async findOne(id: string) {
    const tossCase = await this.prisma.tossCase.findFirst({
      where: { id, deletedAt: null },
      include: { customer: true, appointment: true },
    });
    if (!tossCase) throw new NotFoundException('トス案件が見つかりません');
    return tossCase;
  }

  /** 手動登録(セクション9)。顧客が未指定なら簡易情報からその場で作成する。 */
  async create(dto: CreateTossCaseDto, actorUserId: string) {
    const statusId = dto.statusId ?? (await this.statusResolver.resolveId('TOSS', 'TOSS_NEW'));

    const actor = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId } });

    let customerId = dto.customerId;
    if (!customerId && (dto.corporateName || dto.phone || dto.email)) {
      const customer = await this.prisma.customer.create({
        data: {
          corporateName: dto.corporateName,
          contactName: dto.contactName,
          phone: dto.phone,
          email: dto.email,
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
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return tossCase;
  }

  async update(id: string, dto: UpdateTossCaseDto, userId: string) {
    const existing = await this.findOne(id);
    if (existing.version !== dto.version) {
      throw new ConflictException({ message: '他のユーザーがこのデータを更新しています', latest: existing });
    }

    const { version, desiredAt, confirmedStartAt, confirmedEndAt, ...rest } = dto;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tossCase.updateMany({
        where: { id, version },
        data: {
          ...rest,
          desiredAt: desiredAt ? new Date(desiredAt) : undefined,
          confirmedStartAt: confirmedStartAt ? new Date(confirmedStartAt) : undefined,
          confirmedEndAt: confirmedEndAt ? new Date(confirmedEndAt) : undefined,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException('他のユーザーがこのデータを更新しています');
      return tx.tossCase.findUniqueOrThrow({ where: { id } });
    });

    await this.caseHistory.recordDiff('TOSS_CASE', id, existing, updated, userId);

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
}
