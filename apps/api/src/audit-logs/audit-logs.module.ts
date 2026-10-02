import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditTrailInterceptor } from './audit-trail.interceptor';

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
        // 変更前スナップショット(before)は件数が多いと重いため一覧では返さない。表示に必要なのは after の整形済み情報のみ
        select: {
          id: true,
          action: true,
          targetType: true,
          after: true,
          success: true,
          errorMessage: true,
          createdAt: true,
          actor: { select: { name: true, email: true } },
        },
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
    return this.service.list({ page: Number(page), pageSize: Math.min(Number(pageSize), 2000), action, actorUserId });
  }
}

@Module({
  // 全タブの更新操作を操作ログへ記録する(要望: どのタブで何を何に変えたか)
  providers: [AuditLogsService, { provide: APP_INTERCEPTOR, useClass: AuditTrailInterceptor }],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
