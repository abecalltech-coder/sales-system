import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';

@Injectable()
export class VisitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequence: SequenceService,
    private readonly statusResolver: StatusResolverService,
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
      }),
      this.prisma.visit.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async findOne(id: string) {
    const visit = await this.prisma.visit.findFirst({
      where: { id, deletedAt: null },
      include: { meetingSession: true, statusHistory: { orderBy: { changedAt: 'desc' } } },
    });
    if (!visit) throw new NotFoundException('訪問案件が見つかりません');
    return visit;
  }

  async create(dto: CreateVisitDto, userId: string) {
    const statusId = await this.statusResolver.resolveId('VISIT', 'VISIT_SCHEDULED');
    const caseNumber = await this.sequence.nextCaseNumber('VISIT');
    return this.prisma.visit.create({
      data: {
        caseNumber,
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
    const { version, scheduledAt, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
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
}
