import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRoleDto } from './dto/role.dto';
import { ROLE_DEFS } from './role-defs';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 起動のたびにROLE_DEFSをupsertし、ロール/権限を常に最新化する(要望: 新しい役職
   * (AP/APリーダー/CL/責任者)追加時にRUN_SEED_ON_BOOT無しでも本番へ確実に反映されるように)。
   * upsertのみでStatusMaster等の他データには触れないため副作用はない。
   */
  async onModuleInit() {
    try {
      for (const def of ROLE_DEFS) {
        const role = await this.prisma.role.upsert({
          where: { code: def.code },
          update: { name: def.name },
          create: { code: def.code, name: def.name },
        });
        for (const p of def.permissions) {
          await this.prisma.permission.upsert({
            where: { roleId_resource_action: { roleId: role.id, resource: p.resource, action: p.action } },
            update: { scope: p.scope },
            create: { roleId: role.id, resource: p.resource, action: p.action, scope: p.scope },
          });
        }
      }
      this.logger.log(`ロール定義を同期しました(${ROLE_DEFS.length}件)`);
    } catch (err) {
      this.logger.error('ロール定義の同期に失敗しました', err instanceof Error ? err.stack : String(err));
    }
  }

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
