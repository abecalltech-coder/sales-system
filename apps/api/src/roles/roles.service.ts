import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateRoleDto } from './dto/role.dto';
import { ROLE_DEFS, TASK_VIEW_DEFAULTS } from './role-defs';

@Injectable()
export class RolesService implements OnModuleInit {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 起動のたびにROLE_DEFSをupsertし、ロール/権限を常に最新化する(要望: 新しい役職
   * (AP/APリーダー/CL/責任者)追加時にRUN_SEED_ON_BOOT無しでも本番へ確実に反映されるように)。
   * upsertのみでStatusMaster等の他データには触れないため副作用はない。
   */
  onModuleInit() {
    // 起動(ヘルスチェックの応答)を待たせないよう、同期は裏で行う。
    // 以前は数百件の upsert を起動前に1件ずつ待っており、DBが遅いとき(Railway US West の
    // ストレージ障害時)に起動が数分以上かかってデプロイが失敗していた。
    void this.syncRoleDefs();
  }

  /** ROLE_DEFS とDBの差分だけを書き込む(普段は書き込み0件) */
  async syncRoleDefs() {
    try {
      const existing = await this.prisma.role.findMany({ include: { permissions: true } });
      let writes = 0;
      for (const def of ROLE_DEFS) {
        let role = existing.find((r) => r.code === def.code);
        if (!role) {
          const created = await this.prisma.role.create({ data: { code: def.code, name: def.name, taskView: TASK_VIEW_DEFAULTS[def.code] ?? [] } });
          role = { ...created, permissions: [] };
          writes++;
        } else if (role.name !== def.name) {
          await this.prisma.role.update({ where: { id: role.id }, data: { name: def.name } });
          writes++;
        }
        const roleId = role.id;
        const current = new Map(role.permissions.map((p) => [`${p.resource}:${p.action}`, p]));
        const missing = def.permissions.filter((p) => !current.has(`${p.resource}:${p.action}`));
        if (missing.length) {
          await this.prisma.permission.createMany({
            data: missing.map((p) => ({ roleId, resource: p.resource, action: p.action, scope: p.scope })),
            skipDuplicates: true,
          });
          writes += missing.length;
        }
        for (const p of def.permissions) {
          const cur = current.get(`${p.resource}:${p.action}`);
          if (cur && cur.scope !== p.scope) {
            await this.prisma.permission.update({ where: { id: cur.id }, data: { scope: p.scope } });
            writes++;
          }
        }
      }
      this.logger.log(`ロール定義を同期しました(${ROLE_DEFS.length}件、書き込み${writes}件)`);
    } catch (err) {
      this.logger.error('ロール定義の同期に失敗しました', err instanceof Error ? err.stack : String(err));
    }
  }

  list() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, visibleTabs: true, taskView: true },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ロールが見つかりません');
    return this.prisma.role.update({
      where: { id },
      data: {
        ...(dto.visibleTabs !== undefined
          ? { visibleTabs: dto.visibleTabs === null ? Prisma.DbNull : (dto.visibleTabs as Prisma.InputJsonValue) }
          : {}),
        ...(dto.taskView !== undefined ? { taskView: [...new Set(dto.taskView)] } : {}),
      },
    });
  }
}
