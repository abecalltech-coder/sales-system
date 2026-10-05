import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  APPLICATION_NAME_KEY,
  CASE_NAME_KEY,
  CL_KEY,
  FACTOR_DUE_LABEL,
  FACTOR_TASK,
  MC_DATE_KEY,
  SHOP_SUPPORT_GUIDANCE_KEY,
  SHOP_SUPPORT_TASK,
  dayAt10Jst,
  factorTaskKey,
  shopSupportDueAt,
  shopSupportTaskKey,
} from './deal-auto-tasks';

/** 案件1件から作る自動タスク1種類の決まり */
interface AutoTaskRule {
  name: string;
  keyOf: (dealId: string) => string;
  /** 作る時の期日。作らない(条件外)なら null */
  dueOf: (values: Record<string, unknown>) => Date | null;
  task: { titlePrefix: string; detail: string; importance: number };
}

/**
 * 案件の内容に合わせて自動のタスクを作る・直す・消す(要望: 店サポ解約誘導・ファクタ回収)。
 * 1案件・1種類につき1つ(Task.sourceKey)。人が削除したタスクは作り直さない。担当はCL。
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

  private async rules(): Promise<AutoTaskRule[]> {
    const fields = await this.prisma.dealField.findMany({ include: { options: true } });
    const guidance = fields.find((f) => f.fieldKey === SHOP_SUPPORT_GUIDANCE_KEY);
    const yesId = guidance?.options.find((o) => o.label.trim().startsWith('有'))?.id ?? null;
    const factorKey = fields.find((f) => f.label.trim() === FACTOR_DUE_LABEL)?.fieldKey ?? null;
    return [
      {
        name: '店サポ解約誘導',
        keyOf: shopSupportTaskKey,
        // 店サポ解約誘導有無=有 かつ MC日あり → MC日の月の4ヶ月後の1日 10:00
        dueOf: (v) => (yesId && v[SHOP_SUPPORT_GUIDANCE_KEY] === yesId ? shopSupportDueAt(v[MC_DATE_KEY]) : null),
        task: SHOP_SUPPORT_TASK,
      },
      {
        name: 'ファクタ回収',
        keyOf: factorTaskKey,
        // ファクタ回収期日が入ったら、その日の 10:00
        dueOf: (v) => (factorKey ? dayAt10Jst(v[factorKey]) : null),
        task: FACTOR_TASK,
      },
    ];
  }

  async sync(dealIds: string[], actorId?: string) {
    if (dealIds.length === 0) return;
    const rules = await this.rules();
    const deals = await this.prisma.deal.findMany({ where: { id: { in: dealIds } } });
    const clIds = [...new Set(deals.map((d) => (d.values as Record<string, unknown>)?.[CL_KEY]).filter((v): v is string => typeof v === 'string'))];
    const activeUsers = new Set(
      (await this.prisma.user.findMany({ where: { id: { in: clIds }, deletedAt: null }, select: { id: true } })).map((u) => u.id),
    );
    const keys = deals.flatMap((d) => rules.map((r) => r.keyOf(d.id)));
    const existing = await this.prisma.task.findMany({ where: { sourceKey: { in: keys } } });
    let changed = 0;

    for (const deal of deals) {
      const v = (deal.values ?? {}) as Record<string, unknown>;
      const cl = typeof v[CL_KEY] === 'string' && activeUsers.has(v[CL_KEY] as string) ? (v[CL_KEY] as string) : null;
      const name = String(v[APPLICATION_NAME_KEY] ?? '').trim() || String(v[CASE_NAME_KEY] ?? '').trim();

      for (const rule of rules) {
        const key = rule.keyOf(deal.id);
        const task = existing.find((t) => t.sourceKey === key);
        const dueAt = deal.deletedAt ? null : rule.dueOf(v);
        const want = !!dueAt && !!cl;

        if (!want) {
          // 条件から外れた(無に変更・日付を消した・CLなし・案件を削除)ら自動のタスクも消す
          if (task && !task.deletedAt) {
            await this.prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
            changed++;
          }
          continue;
        }
        if (task?.deletedAt) continue; // 人が削除したものは作り直さない

        const data = {
          title: `${rule.task.titlePrefix}${name}`,
          detail: rule.task.detail,
          targetAll: false,
          targetDepartmentIds: [],
          targetUserIds: [cl!],
          dueAt: dueAt!,
          importance: rule.task.importance,
          remindMinutes: null,
          repeatType: 'NONE',
          repeatInterval: 1,
          repeatWeekdays: [],
          repeatUntil: null,
        };
        if (!task) {
          await this.prisma.task.create({ data: { ...data, sourceKey: key, createdBy: actorId ?? deal.updatedBy ?? deal.createdBy ?? cl! } });
          changed++;
        } else if (task.title !== data.title || task.dueAt?.getTime() !== data.dueAt.getTime() || task.targetUserIds.join() !== data.targetUserIds.join()) {
          // 日付・CL・申込名義が変わったら合わせる
          await this.prisma.task.update({ where: { id: task.id }, data: { title: data.title, dueAt: data.dueAt, targetUserIds: data.targetUserIds } });
          changed++;
        }
      }
    }
    if (changed) {
      this.logger.log(`案件の自動タスクを${changed}件更新しました`);
      this.realtime.emitToAll('tasks.updated', {});
    }
  }
}
