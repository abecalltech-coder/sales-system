import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Injectable()
class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { page: number; pageSize: number; action?: string; actorUserId?: string }) {
    const where = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }
}

@Controller('audit-logs')
class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  @RequirePermissions({ resource: 'system', action: 'view' })
  @Get()
  list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
  ) {
    return this.service.list({ page: Number(page), pageSize: Math.min(Number(pageSize), 200), action, actorUserId });
  }
}

@Module({
  providers: [AuditLogsService],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
