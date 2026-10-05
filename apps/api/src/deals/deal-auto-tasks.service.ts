import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  APPLICATION_NAME_KEY,
  CASE_NAME_KEY,
  CL_KEY,
  MC_DATE_KEY,
  SHOP_SUPPORT_GUIDANCE_KEY,
  SHOP_SUPPORT_TASK,
  shopSupportDueAt,
  shopSupportTaskKey,
} from './deal-auto-tasks';

/**
 * 案件の内容に合わせて自動のタスクを作る・直す・消す(要望: 店サポ解約誘導)。
 * 1案件につき1つ(Task.sourceKey)。人が削除したタスクは作り直さない。
 */
@Injectable()
export class DealAutoTasksService implements OnModuleInit {
  private readonly logger = new Logger(DealAutoTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit() {
    // 機能追加前から条件を満たしている案件の分も作る(起動を待たせない)
    void this.syncAll().catch((err) => this.logger.error('自動タスクの同期に失敗しました', err instanceof Error ? err.stack : String(err)));
  }

  async syncAll() {
    const deals = await this.prisma.deal.findMany({ where: { deletedAt: null }, select: { id: true } });
    await this.sync(deals.map((d) => d.id));
  }

  async sync(dealIds: string[], actorId?: string) {
    if (dealIds.length === 0) return;
    const guidance = await this.prisma.dealField.findUnique({ where: { fieldKey: SHOP_SUPPORT_GUIDANCE_KEY }, include: { options: true } });
    const yesId = guidance?.options.find((o) => o.label.trim().startsWith('有'))?.id ?? null;
    const deals = await this.prisma.deal.findMany({ where: { id: { in: dealIds } } });
    const clIds = [...new Set(deals.map((d) => (d.values as Record<string, unknown>)?.[CL_KEY]).filter((v): v is string => typeof v === 'string'))];
    const activeUsers = new Set(
      (await this.prisma.user.findMany({ where: { id: { in: clIds }, deletedAt: null }, select: { id: true } })).map((u) => u.id),
    );
    const existing = await this.prisma.task.findMany({ where: { sourceKey: { in: deals.map((d) => shopSupportTaskKey(d.id)) } } });
    let changed = 0;

    for (const deal of deals) {
      const v = (deal.values ?? {}) as Record<string, unknown>;
      const key = shopSupportTaskKey(deal.id);
      const task = existing.find((t) => t.sourceKey === key);
      const cl = typeof v[CL_KEY] === 'string' && activeUsers.has(v[CL_KEY] as string) ? (v[CL_KEY] as string) : null;
      const dueAt = shopSupportDueAt(v[MC_DATE_KEY]);
      const want = !deal.deletedAt && !!yesId && v[SHOP_SUPPORT_GUIDANCE_KEY] === yesId && !!dueAt && !!cl;

      if (!want) {
        // 条件から外れた(無に変更・MC日を消した・案件を削除)ら自動のタスクも消す
        if (task && !task.deletedAt) {
          await this.prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
          changed++;
        }
        continue;
      }
      if (task?.deletedAt) continue; // 人が削除したものは作り直さない

      const name = String(v[APPLICATION_NAME_KEY] ?? '').trim() || String(v[CASE_NAME_KEY] ?? '').trim();
      const data = {
        title: `${SHOP_SUPPORT_TASK.titlePrefix}${name}`,
        detail: SHOP_SUPPORT_TASK.detail,
        targetAll: false,
        targetDepartmentIds: [],
        targetUserIds: [cl!],
        dueAt: dueAt!,
        importance: SHOP_SUPPORT_TASK.importance,
        remindMinutes: null,
        repeatType: 'NONE',
        repeatInterval: 1,
        repeatWeekdays: [],
        repeatUntil: null,
      };
      if (!task) {
        await this.prisma.task.create({ data: { ...data, sourceKey: key, createdBy: actorId ?? deal.updatedBy ?? deal.createdBy ?? cl! } });
        changed++;
      } else if (
        task.title !== data.title ||
        task.dueAt?.getTime() !== data.dueAt.getTime() ||
        task.targetUserIds.join() !== data.targetUserIds.join()
      ) {
        // MC日・CL・申込名義が変わったら合わせる(期日が変われば完了状況はその回で数え直される)
        await this.prisma.task.update({ where: { id: task.id }, data: { title: data.title, dueAt: data.dueAt, targetUserIds: data.targetUserIds } });
        changed++;
      }
    }
    if (changed) {
      this.logger.log(`案件の自動タスクを${changed}件更新しました`);
      this.realtime.emitToAll('tasks.updated', {});
    }
  }
}
