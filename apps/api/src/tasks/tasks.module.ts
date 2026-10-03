import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Logger, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Task, TaskProgress } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { nextOccurrence, NO_DUE } from './occurrence';

const REPEAT_TYPES = ['NONE', 'MONTHLY', 'WEEKLY', 'DAILY', 'WEEKDAYS', 'HOURLY'];
/** リマインド(要望: 1日前〜5分前) */
export const REMIND_OPTIONS = [1440, 720, 360, 180, 120, 60, 30, 15, 10, 5];
const SNOOZE_MS = 5 * 60_000;
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

class SaveTaskDto {
  @IsString() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) detail?: string;
  @IsBoolean() targetAll!: boolean;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(100) targetDepartmentIds!: string[];
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(2000) targetUserIds!: string[];
  /** ISO日時。null/空で期日なし */
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsString() dueAt?: string | null;
  @IsInt() @Min(1) @Max(5) importance!: number;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(REMIND_OPTIONS) remindMinutes?: number | null;
  @IsIn(REPEAT_TYPES) repeatType!: string;
  @IsInt() @Min(1) @Max(1000) repeatInterval!: number;
  @IsArray() @IsInt({ each: true }) @ArrayMaxSize(7) repeatWeekdays!: number[];
  @IsOptional() @ValidateIf((_o, v) => v !== null && v !== '') @IsString() repeatUntil?: string | null;
}

type UserLite = { id: string; name: string; departmentId: string | null };

@Injectable()
class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly push: PushNotificationsService,
  ) {}

  private changed() {
    this.realtime.emitToAll('tasks.updated', {});
  }

  private async activeUsers(): Promise<UserLite[]> {
    return this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, departmentId: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  /** そのタスクの担当者(All・部署全体を個人に展開) */
  private targetsOf(task: Task, users: UserLite[]): string[] {
    if (task.targetAll) return users.map((u) => u.id);
    const set = new Set(task.targetUserIds);
    for (const u of users) if (u.departmentId && task.targetDepartmentIds.includes(u.departmentId)) set.add(u.id);
    return [...set];
  }

  private isTarget(task: Task, user: { id: string; departmentId: string | null }) {
    return task.targetAll || task.targetUserIds.includes(user.id) || (!!user.departmentId && task.targetDepartmentIds.includes(user.departmentId));
  }

  /** その人の今の回(完了済みなら null) */
  private currentFor(task: Task, progress: TaskProgress | undefined): Date | null {
    return nextOccurrence(task, progress?.doneThrough ?? null);
  }

  private parseDate(v: string | null | undefined, label: string): Date | null {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`${label}の形式が正しくありません`);
    return d;
  }

  private validate(dto: SaveTaskDto) {
    if (!dto.title.trim()) throw new BadRequestException('タスク名を入力してください');
    if (!dto.targetAll && dto.targetDepartmentIds.length === 0 && dto.targetUserIds.length === 0) {
      throw new BadRequestException('誰のタスクかを選んでください');
    }
    if (dto.repeatType !== 'NONE' && !dto.dueAt) throw new BadRequestException('繰り返しには期日と時間が必要です');
    if (dto.repeatType === 'WEEKDAYS' && dto.repeatWeekdays.length === 0) throw new BadRequestException('繰り返す曜日を選んでください');
  }

  private dataOf(dto: SaveTaskDto) {
    return {
      title: dto.title.trim(),
      detail: dto.detail?.trim() || null,
      targetAll: dto.targetAll,
      targetDepartmentIds: [...new Set(dto.targetDepartmentIds)],
      targetUserIds: [...new Set(dto.targetUserIds)],
      dueAt: this.parseDate(dto.dueAt, '期日'),
      importance: dto.importance,
      remindMinutes: dto.remindMinutes ?? null,
      repeatType: dto.repeatType,
      repeatInterval: dto.repeatInterval,
      repeatWeekdays: dto.repeatType === 'WEEKDAYS' ? [...new Set(dto.repeatWeekdays)].filter((d) => d >= 0 && d <= 6) : [],
      repeatUntil: dto.repeatType === 'NONE' ? null : this.parseDate(dto.repeatUntil, '繰り返しの終了日'),
    };
  }

  private canEdit(task: Task, user: AuthenticatedUser) {
    return task.createdBy === user.id || user.roles.some((r) => ADMIN_ROLES.includes(r));
  }

  async list(user: AuthenticatedUser, includeDone: boolean) {
    const [tasks, users, departments] = await Promise.all([
      this.prisma.task.findMany({ where: { deletedAt: null }, include: { progress: true } }),
      this.activeUsers(),
      this.prisma.department.findMany({ select: { id: true, name: true } }),
    ]);
    const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '(退職/不明)';
    const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '(不明な部署)';
    const now = new Date();

    const rows = tasks
      .filter((t) => t.createdBy === user.id || this.isTarget(t, user))
      .map((t) => {
        const mine = this.isTarget(t, user);
        const myProgress = t.progress.find((p) => p.userId === user.id);
        const myCurrent = mine ? this.currentFor(t, myProgress) : null;
        // 表示する期日: 担当者なら自分の今の回。作成者だけなら今後の最初の回
        const shown = mine ? myCurrent : t.repeatType === 'NONE' ? nextOccurrence(t, null) : nextOccurrence(t, new Date(now.getTime() - 1));
        const targets = this.targetsOf(t, users);
        const doneCount = targets.filter((uid) => {
          const c = this.currentFor(t, t.progress.find((p) => p.userId === uid));
          return c === null || (shown !== null && c.getTime() > shown.getTime());
        }).length;
        return {
          id: t.id,
          title: t.title,
          detail: t.detail,
          targetAll: t.targetAll,
          targetDepartmentIds: t.targetDepartmentIds,
          targetUserIds: t.targetUserIds,
          // 表示用の分類(要望: 個人/部署/All が分かるように)
          categories: [
            ...(t.targetAll ? [{ kind: 'ALL', label: 'All' }] : []),
            ...t.targetDepartmentIds.map((id) => ({ kind: 'DEPARTMENT', label: `部署: ${deptName(id)}` })),
            ...(t.targetUserIds.length ? [{ kind: 'PERSONAL', label: `個人: ${t.targetUserIds.map(nameOf).join('、')}` }] : []),
          ],
          dueAt: t.dueAt,
          currentDueAt: shown && shown.getTime() !== NO_DUE.getTime() ? shown : null,
          importance: t.importance,
          remindMinutes: t.remindMinutes,
          repeatType: t.repeatType,
          repeatInterval: t.repeatInterval,
          repeatWeekdays: t.repeatWeekdays,
          repeatUntil: t.repeatUntil,
          createdBy: t.createdBy,
          createdByName: nameOf(t.createdBy),
          isMine: mine,
          doneByMe: mine && myCurrent === null,
          doneCount,
          targetCount: targets.length,
          canEdit: this.canEdit(t, user),
          overdue: !!shown && shown.getTime() !== NO_DUE.getTime() && shown.getTime() < now.getTime() && !(mine && myCurrent === null),
        };
      })
      .filter((r) => includeDone || !r.doneByMe);

    // 上から期日順(要望)。期日なしは後ろ、自分の完了済みは最後
    rows.sort((a, b) => {
      if (a.doneByMe !== b.doneByMe) return a.doneByMe ? 1 : -1;
      const da = a.currentDueAt ? new Date(a.currentDueAt).getTime() : Infinity;
      const db = b.currentDueAt ? new Date(b.currentDueAt).getTime() : Infinity;
      return da - db || b.importance - a.importance;
    });
    return rows;
  }

  async create(dto: SaveTaskDto, user: AuthenticatedUser) {
    this.validate(dto);
    const t = await this.prisma.task.create({ data: { ...this.dataOf(dto), createdBy: user.id } });
    this.changed();
    return { id: t.id };
  }

  private async get(id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!t) throw new NotFoundException('タスクが見つかりません');
    return t;
  }

  async update(id: string, dto: SaveTaskDto, user: AuthenticatedUser) {
    const t = await this.get(id);
    if (!this.canEdit(t, user)) throw new ForbiddenException('このタスクを編集できるのは作成者です');
    this.validate(dto);
    await this.prisma.task.update({ where: { id }, data: this.dataOf(dto) });
    // 期日などが変わったら通知をやり直す
    await this.prisma.taskProgress.updateMany({ where: { taskId: id }, data: { snoozeUntil: null, lastNotifiedOccurrence: null, lastNotifiedAt: null } });
    this.changed();
    return { ok: true };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const t = await this.get(id);
    if (!this.canEdit(t, user)) throw new ForbiddenException('このタスクを削除できるのは作成者です');
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    this.changed();
    return { ok: true };
  }

  private async assertTarget(t: Task, user: AuthenticatedUser) {
    if (!this.isTarget(t, user)) throw new ForbiddenException('このタスクの担当者ではありません');
  }

  /** 完了(自分の今の回)。繰り返しタスクは次の回が現れる */
  async complete(id: string, user: AuthenticatedUser) {
    const t = await this.get(id);
    await this.assertTarget(t, user);
    const progress = await this.prisma.taskProgress.findUnique({ where: { taskId_userId: { taskId: id, userId: user.id } } });
    const current = this.currentFor(t, progress ?? undefined);
    if (!current) return { ok: true };
    await this.prisma.taskProgress.upsert({
      where: { taskId_userId: { taskId: id, userId: user.id } },
      update: { doneThrough: current, doneAt: new Date(), snoozeUntil: null },
      create: { taskId: id, userId: user.id, doneThrough: current, doneAt: new Date() },
    });
    this.changed();
    return { ok: true };
  }

  /** 完了を取り消す(繰り返し無し・期日なしのみ) */
  async reopen(id: string, user: AuthenticatedUser) {
    const t = await this.get(id);
    await this.assertTarget(t, user);
    await this.prisma.taskProgress.updateMany({ where: { taskId: id, userId: user.id }, data: { doneThrough: null, doneAt: null } });
    this.changed();
    return { ok: true };
  }

  /** 5分後に再通知 */
  async snooze(id: string, user: AuthenticatedUser) {
    const t = await this.get(id);
    await this.assertTarget(t, user);
    const until = new Date(Date.now() + SNOOZE_MS);
    await this.prisma.taskProgress.upsert({
      where: { taskId_userId: { taskId: id, userId: user.id } },
      update: { snoozeUntil: until },
      create: { taskId: id, userId: user.id, snoozeUntil: until },
    });
    this.realtime.emitToUser(user.id, 'tasks.updated', {});
    return { ok: true, snoozeUntil: until };
  }

  /** 通知の時刻 */
  private alertAt(t: Task, occurrence: Date) {
    return new Date(occurrence.getTime() - (t.remindMinutes ?? 0) * 60_000);
  }

  /** 今出しておくべき通知(要望: 対応完了・編集・5分後再通知のいずれかを押すまで消えない) */
  async alerts(user: AuthenticatedUser) {
    const tasks = await this.prisma.task.findMany({
      where: { deletedAt: null, dueAt: { not: null } },
      include: { progress: { where: { userId: user.id } } },
    });
    const now = Date.now();
    const out = [];
    for (const t of tasks) {
      if (!this.isTarget(t, user)) continue;
      const p = t.progress[0];
      const current = this.currentFor(t, p);
      if (!current || current.getTime() === NO_DUE.getTime()) continue;
      if (this.alertAt(t, current).getTime() > now) continue;
      if (p?.snoozeUntil && p.snoozeUntil.getTime() > now) continue;
      out.push({ id: t.id, title: t.title, detail: t.detail, importance: t.importance, occurrence: current });
    }
    return out.sort((a, b) => a.occurrence.getTime() - b.occurrence.getTime());
  }

  /** 毎分: 通知の時刻になったタスクを担当者の端末へ送る(同じ回は1度。5分後再通知のあとは再送) */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendDue() {
    try {
      const [tasks, users] = await Promise.all([
        this.prisma.task.findMany({ where: { deletedAt: null, dueAt: { not: null } }, include: { progress: true } }),
        this.activeUsers(),
      ]);
      const now = Date.now();
      for (const t of tasks) {
        for (const uid of this.targetsOf(t, users)) {
          const p = t.progress.find((x) => x.userId === uid);
          const current = this.currentFor(t, p);
          if (!current || current.getTime() === NO_DUE.getTime()) continue;
          if (this.alertAt(t, current).getTime() > now) continue;
          if (p?.snoozeUntil && p.snoozeUntil.getTime() > now) continue;
          const sameOccurrence = p?.lastNotifiedOccurrence?.getTime() === current.getTime();
          const afterSnooze = !!p?.snoozeUntil && (!p.lastNotifiedAt || p.lastNotifiedAt.getTime() < p.snoozeUntil.getTime());
          if (sameOccurrence && !afterSnooze) continue;

          await this.prisma.taskProgress.upsert({
            where: { taskId_userId: { taskId: t.id, userId: uid } },
            update: { lastNotifiedOccurrence: current, lastNotifiedAt: new Date(), snoozeUntil: null },
            create: { taskId: t.id, userId: uid, lastNotifiedOccurrence: current, lastNotifiedAt: new Date() },
          });
          const when = current.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
          await this.push.sendToUser(uid, {
            title: `【タスク】${t.title}`,
            body: `期日 ${when}${t.detail ? `\n${t.detail.slice(0, 80)}` : ''}`,
            url: `/tasks?edit=${t.id}`,
            tag: `task:${t.id}`,
            requireInteraction: true,
            actions: [
              { action: 'task-done', title: '対応完了' },
              { action: 'task-snooze', title: '5分後再通知' },
              { action: 'task-edit', title: '編集' },
            ],
            data: { taskId: t.id },
          });
          this.realtime.emitToUser(uid, 'tasks.updated', {});
        }
      }
    } catch (e) {
      this.logger.warn(`タスク通知の送信に失敗: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** 権限デコレータ無し = ログインユーザーなら利用可(見られるのは自分が作成・担当のタスクのみ) */
@Controller('tasks')
class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeDone') includeDone?: string) {
    return this.tasks.list(user, includeDone === '1');
  }

  @Get('alerts')
  alerts(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.alerts(user);
  }

  @Post()
  create(@Body() dto: SaveTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.remove(id, user);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.complete(id, user);
  }

  @Post(':id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.reopen(id, user);
  }

  @Post(':id/snooze')
  snooze(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.snooze(id, user);
  }
}

@Module({
  imports: [PushNotificationsModule],
  providers: [TasksService],
  controllers: [TasksController],
})
export class TasksModule {}
