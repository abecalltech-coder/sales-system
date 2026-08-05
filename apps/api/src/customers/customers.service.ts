import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CaseHistoryService } from '../common/services/case-history.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseHistory: CaseHistoryService,
  ) {}

  async list(params: { page: number; pageSize: number; keyword?: string }) {
    const where: Prisma.CustomerWhereInput = {
      deletedAt: null,
      ...(params.keyword
        ? {
            OR: [
              { corporateName: { contains: params.keyword, mode: 'insensitive' } },
              { contactName: { contains: params.keyword, mode: 'insensitive' } },
              { phone: { contains: params.keyword } },
              { email: { contains: params.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundException('顧客が見つかりません');
    return customer;
  }

  /** 電話番号・メール・法人名の一致で重複候補を検索する(セクション9の重複検知に利用) */
  async findDuplicateCandidates(params: { phone?: string; email?: string; corporateName?: string }) {
    if (!params.phone && !params.email && !params.corporateName) return [];
    return this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        OR: [
          params.phone ? { phone: params.phone } : undefined,
          params.email ? { email: params.email } : undefined,
          params.corporateName ? { corporateName: params.corporateName } : undefined,
        ].filter((v): v is NonNullable<typeof v> => Boolean(v)),
      },
      take: 10,
    });
  }

  async create(dto: CreateCustomerDto, userId: string) {
    return this.prisma.customer.create({
      data: { ...dto, createdBy: userId, updatedBy: userId },
    });
  }

  async update(id: string, dto: UpdateCustomerDto, userId: string) {
    const existing = await this.findOne(id);
    const { version, ...rest } = dto;

    const result = await this.prisma.customer.updateMany({
      where: { id, version },
      data: { ...rest, updatedBy: userId, version: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException({
        message: '他のユーザーがこのデータを更新しています',
        latest: await this.findOne(id),
      });
    }

    await this.caseHistory.recordDiff('CUSTOMER', id, existing, rest, userId);
    return this.findOne(id);
  }

  async softDelete(id: string, userId: string) {
    await this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return { ok: true };
  }
}
