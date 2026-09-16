import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, visibleTabs: true },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ロールが見つかりません');
    return this.prisma.role.update({
      where: { id },
      data: {
        visibleTabs:
          dto.visibleTabs == null ? Prisma.DbNull : (dto.visibleTabs as Prisma.InputJsonValue),
      },
    });
  }
}
