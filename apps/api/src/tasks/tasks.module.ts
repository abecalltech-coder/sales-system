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
/** リマインドなし(要望): 端末の通知もアプリ内の通知も出さない */
export const REMIND_NONE = -1;
/** リマインド(要望: 1日前〜5分前、なし)。null は期日ちょうど */
export const REMIND_OPTIONS = [1440, 720, 360, 180, 120, 60, 30, 15, 10, 5, REMIND_NONE];
/** タスク閲覧範囲「AP全員」の対象になる役職 */
const AP_ROLE_CODES = ['AP', 'AP_LEADER'];
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
export class TasksService {
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

  /**
   * このユーザーが見られる人(自分を含む)。範囲は役職ごとにユーザー管理で設定(Role.taskView)。
   * 複数の役職を持つ人は、それぞれの範囲を合わせたもの
   */
  private async viewableUsers(user: AuthenticatedUser): Promise<UserLite[]> {
    const roles = await this.prisma.role.findMany({ where: { code: { in: user.roles } }, select: { taskView: true } });
    const scopes = new Set(roles.flatMap((r) => r.taskView));
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, departmentId: true, roles: { select: { role: { select: { code: true } } } } },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
    return users
      .filter(
        (u) =>
          scopes.has('ALL') ||
          u.id === user.id ||
          (scopes.has('AP') && u.roles.some((r) => AP_ROLE_CODES.includes(r.role.code))) ||
          (scopes.has('DEPT') && !!user.departmentId && u.departmentId === user.departmentId),
      )
      .map(({ id, name, departmentId }) => ({ id, name, departmentId }));
  }

  /** 表示切り替えの選択肢(見られる人と、その人たちの部署) */
  async viewable(user: AuthenticatedUser) {
    const users = await this.viewableUsers(user);
    const deptIds = [...new Set(users.map((u) => u.departmentId).filter((d): d is string => !!d))];
    const departments = await this.prisma.department.findMany({ where: { id: { in: deptIds } }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return { users, departments, canViewOthers: users.some((u) => u.id !== user.id) };
  }

  /** view: 'user:<id>' / 'dept:<id>' / 'all' を、見られる人に絞って解決する */
  private async resolveView(user: AuthenticatedUser, view: string): Promise<{ subjects: UserLite[]; single: boolean }> {
    const viewable = await this.viewableUsers(user);
    if (view === 'all') return { subjects: viewable, single: false };
    if (view.startsWith('dept:')) return { subjects: viewable.filter((u) => u.departmentId === view.slice(5)), single: false };
    if (view.startsWith('user:')) {
      const u = viewable.find((x) => x.id === view.slice(5));
      if (!u) throw new ForbiddenException('この人のタスクを見る権限がありません');
      return { subjects: [u], single: true };
    }
    throw new BadRequestException('表示の指定が正しくありません');
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

  async list(user: AuthenticatedUser, includeDone: boolean, view?: string) {
    // 他の人のタスクを見るとき(要望)。1人なら「その人の目線」、部署・全員なら担当者ごとの完了状況を付ける
    const other = view && view !== 'me' ? await this.resolveView(user, view) : null;
    const subject: UserLite | AuthenticatedUser = other?.single ? other.subjects[0] : user;
    const [tasks, users, departments] = await Promise.all([
      this.prisma.task.findMany({ where: { deletedAt: null }, include: { progress: true } }),
      this.activeUsers(),
      this.prisma.department.findMany({ select: { id: true, name: true } }),
    ]);
    const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? '(退職/不明)';
    const deptName = (id: string) => departments.find((d) => d.id === id)?.name ?? '(不明な部署)';
    const now = new Date();

    const rows = tasks
      .filter((t) => (other ? other.subjects.some((s) => this.isTarget(t, s)) : t.createdBy === user.id || this.isTarget(t, user)))
      .map((t) => {
        // mine/doneByMe は「見ている人」(自分 or 選んだ1人)の状態。部署・全員表示では使わない
        const mine = (!other || other.single) && this.isTarget(t, subject);
        const myProgress = t.progress.find((p) => p.userId === subject.id);
        const myCurrent = mine ? this.currentFor(t, myProgress) : null;
        // 表示する期日: 担当者なら自分の今の回。作成者だけなら今後の最初の回
        const shown = mine ? myCurrent : t.repeatType === 'NONE' ? nextOccurrence(t, null) : nextOccurrence(t, new Date(now.getTime() - 1));
        const targets = this.targetsOf(t, users);
        const doneCount = targets.filter((uid) => {
          const c = this.currentFor(t, t.progress.find((p) => p.userId === uid));
          return c === null || (shown !== null && c.getTime() > shown.getTime());
        }).length;
        // 部署・全員表示: 表示中の人のうち担当者の完了状況
        const assignees =
          other && !other.single
            ? other.subjects
                .filter((s) => this.isTarget(t, s))
                .map((s) => {
                  const c = this.currentFor(t, t.progress.find((p) => p.userId === s.id));
                  return { id: s.id, name: s.name, done: c === null || (shown !== null && c.getTime() > shown.getTime()) };
                })
            : null;
        return {
          id: t.id,
          title: t.title,
          detail: t.detail,
          assignees,
          // 自分が担当者として完了操作できるか(他の人の表示では不可)
          canComplete: !other && mine,
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
      .filter((r) => includeDone || !(r.doneByMe || (r.assignees && r.assignees.length > 0 && r.assignees.every((a) => a.done))));

    // 上から期日順(要望)。期日なしは後ろ、自分の完了済みは最後
    rows.sort((a, b) => {
      if (a.doneByMe !== b.doneByMe) return a.doneByMe ? 1 : -1;
      const da = a.currentDueAt ? new Date(a.currentDueAt).getTime() : Infinity;
      const db = b.currentDueAt ? new Date(b.currentDueAt).getTime() : Infinity;
      return da - db || b.importance - a.importance;
    });
    return rows;
  }

  /**
   * 担当者ごとの完了状況(要望: 複数人のタスクは誰が完了で誰が未完了か分かるように)。
   * 一覧と同じ「表示中の回」を基準に、その回を完了していれば完了とする。
   */
  async progress(id: string, user: AuthenticatedUser) {
    const t = await this.prisma.task.findFirst({ where: { id, deletedAt: null }, include: { progress: true } });
    if (!t) throw new NotFoundException('タスクが見つかりません');
    if (t.createdBy !== user.id && !this.isTarget(t, user) && !user.roles.some((r) => ADMIN_ROLES.includes(r))) {
      const viewable = await this.viewableUsers(user);
      if (!viewable.some((u) => this.isTarget(t, u))) throw new ForbiddenException('このタスクを見る権限がありません');
    }
    const users = await this.activeUsers();
    const mine = this.isTarget(t, user);
    const shown = mine
      ? this.currentFor(t, t.progress.find((p) => p.userId === user.id))
      : t.repeatType === 'NONE'
        ? nextOccurrence(t, null)
        : nextOccurrence(t, new Date(Date.now() - 1));
    const done: { id: string; name: string; doneAt: Date | null }[] = [];
    const notDone: { id: string; name: string }[] = [];
    for (const uid of this.targetsOf(t, users)) {
      const p = t.progress.find((x) => x.userId === uid);
      const c = this.currentFor(t, p);
      const name = users.find((u) => u.id === uid)?.name ?? '(不明)';
      if (c === null || (shown !== null && c.getTime() > shown.getTime())) done.push({ id: uid, name, doneAt: p?.doneAt ?? null });
      else notDone.push({ id: uid, name });
    }
    return { occurrence: shown && shown.getTime() !== NO_DUE.getTime() ? shown : null, done, notDone };
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

  /** 今出しておくべきアプリ内の通知(期日を過ぎた未完了。対応完了・編集・5分後再通知のいずれかを押すまで消えない) */
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
      if (t.remindMinutes === REMIND_NONE) continue; // リマインドなし
      // アプリ内の通知は期日の時刻になってから出す(要望: それまでは表示しない)。
      // リマインド(○分前)は端末の通知(sendDue)で知らせる
      if (current.getTime() > now) continue;
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
          if (t.remindMinutes === REMIND_NONE) continue; // リマインドなし
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
  list(@CurrentUser() user: AuthenticatedUser, @Query('includeDone') includeDone?: string, @Query('view') view?: string) {
    return this.tasks.list(user, includeDone === '1', view);
  }

  /** 他の人のタスクの表示切り替えの選択肢 */
  @Get('viewable')
  viewable(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.viewable(user);
  }

  @Get('alerts')
  alerts(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.alerts(user);
  }

  @Get(':id/progress')
  progress(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.progress(id, user);
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
