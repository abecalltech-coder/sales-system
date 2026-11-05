import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Put,
  Query,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { periodMonthDays, periodMonthRange } from '../common/utils/period.util';

/**
 * 個人別数値(要望: シフトに代わり、人員ごとのシートで日別の実績を入力・集計する。スプレッドシートの週次表の再現)。
 * - 日別の値は手入力したものだけ PersonalDailyStat に持つ。入力が無い日はシステム上の実績(トス・アポ・商談)から自動で出す
 * - 週目標(ストーリー)・あるべき姿(月間目標)はユーザー×月で PersonalStatTarget に持ち、管理者だけ編集できる
 * - 見られる範囲は既存の権限(トス/アポの編集範囲)に合わせる: 自分のみ / チーム / 部署 / 全員
 */

export const METRICS = [
  { key: 'TOSS_UP', label: 'トスアップ数' },
  { key: 'APPOINTMENT', label: 'アポイント数' },
  { key: 'MEETING', label: '商談実施数' },
  { key: 'JUSETSU_OK', label: '重説OK数' },
  { key: 'ET', label: 'ET数' },
] as const;
const METRIC_KEYS = METRICS.map((m) => m.key) as string[];
/**
 * アポインターのシートだけで使う日別の値(要望): トス・アポの月初予算/修正予算、稼働時間(分。1〜8hを15分刻み)。
 * 実績と同じ PersonalDailyStat に入れる。
 */
const PLAN_KEYS = ['TOSS_UP_BUDGET', 'TOSS_UP_REVISED', 'APPOINTMENT_BUDGET', 'APPOINTMENT_REVISED', 'WORK_MINUTES'];
const DAILY_KEYS = [...METRIC_KEYS, ...PLAN_KEYS];
const todayJst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
/** 着地見込みを手入力できる日か(明日以降) */
export const isLandingEditable = (date: string, today: string) => date > today;
/** 人員シートのタブに並べる役職(要望: AP と APリーダーだけ。CL は不要) */
const SALES_ROLES = ['AP', 'AP_LEADER'];
/** アポインター(トス・アポを予算管理する人)の役職 */
const APPOINTER_ROLES = SALES_ROLES;
/** 名前の横に出す役職名(APリーダーを優先) */
const roleLabelOf = (roles: { role: { code: string; name: string } }[]) =>
  (roles.find((r) => r.role.code === 'AP_LEADER') ?? roles.find((r) => r.role.code === 'AP'))?.role.name ?? '';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const SCOPE_RANK: Record<string, number> = { OWN: 0, TEAM: 1, DEPT: 2, ALL: 3 };

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 名前の照合用: 全角/半角・空白の違いを吸収する(サマリーと同じ) */
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
const matches = (opt: { internalCode: string; displayName: string } | undefined, codes: string[], names: string[]) =>
  !!opt && (codes.includes(opt.internalCode) || names.includes(opt.displayName.trim()));
const jstDateKey = (d: Date) => new Date(d.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

const isAdmin = (user: AuthenticatedUser) => user.roles.some((r) => ADMIN_ROLES.includes(r));

/** 見られる範囲。管理者は全員、それ以外はトス/アポの「編集」権限の範囲(一般ユーザーは自分だけ) */
function scopeOf(user: AuthenticatedUser): 'OWN' | 'TEAM' | 'DEPT' | 'ALL' {
  if (isAdmin(user)) return 'ALL';
  let best = 'OWN';
  for (const p of user.permissions) {
    if (p.action !== 'edit' || !['toss_case', 'appointment'].includes(p.resource)) continue;
    if ((SCOPE_RANK[p.scope] ?? 0) > SCOPE_RANK[best]) best = p.scope;
  }
  return best as 'OWN' | 'TEAM' | 'DEPT' | 'ALL';
}

class GetSheetQuery {
  @IsString() userId!: string;
  @Matches(PERIOD_RE) month!: string;
}

class GetDepartmentQuery {
  @IsString() departmentId!: string;
  @Matches(PERIOD_RE) month!: string;
}

class SaveDailyDto {
  @IsString() userId!: string;
  @Matches(DATE_RE) date!: string;
  @IsIn(DAILY_KEYS) metricKey!: string;
  /** null で手入力を消す(システム実績の自動値に戻る) */
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(100000) value!: number | null;
  /** 読んだときの version。まだ行が無ければ null */
  @ValidateIf((_o, v) => v !== null) @IsInt() version!: number | null;
}

class SaveTargetDto {
  @IsString() userId!: string;
  @Matches(PERIOD_RE) month!: string;
  @IsIn(METRIC_KEYS) metricKey!: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(100000) weeklyStory?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(100000) monthlyGoal?: number | null;
  @ValidateIf((_o, v) => v !== null) @IsInt() version!: number | null;
}

/** 部署ストーリーの行(要望: トスアップ・アポイント・商談実施・成約法人・重説OK・ET) */
export const STORY_METRICS = ['TOSS_UP', 'APPOINTMENT', 'MEETING', 'CONTRACT_CORP', 'JUSETSU_OK', 'ET'];
const STORY_CELL_RE = new RegExp(
  `^(d:\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])|w:[0-5]|m):(${STORY_METRICS.join('|')})$`,
);

class GetStoryQuery {
  @IsString() departmentId!: string;
  @Matches(PERIOD_RE) month!: string;
}

class SaveStoryDto {
  @IsString() departmentId!: string;
  @Matches(PERIOD_RE) month!: string;
  @Matches(STORY_CELL_RE) cell!: string;
  @ValidateIf((_o, v) => v !== null) @IsInt() @Min(0) @Max(1000000) value!: number | null;
  @ValidateIf((_o, v) => v !== null) @IsInt() version!: number | null;
}

type AutoTarget = { id: string; name: string; roles: { role: { code: string } }[] };
type AutoSource = Awaited<ReturnType<PersonalStatsService['loadAutoSource']>>;

const CONFLICT_MESSAGE = '他のユーザーが先に更新しました。最新の値を表示します';

@Injectable()
export class PersonalStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** 人員シートのタブ: 有効なユーザーのうち営業系の役職の人(要望: 誰でも全員のシートを見て変更できる) */
  async users() {
    const where: Prisma.UserWhereInput = {
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { code: { in: SALES_ROLES } } } },
    };
    // 部署ごとに切り替えて見るため、部署(組織管理の並び順)も返す
    const users = await this.prisma.user.findMany({
      where,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        department: { select: { id: true, name: true, order: true } },
        roles: { select: { role: { select: { code: true, name: true } } } },
      },
    });
    return users
      .sort((a, b) => (a.department?.order ?? Number.MAX_SAFE_INTEGER) - (b.department?.order ?? Number.MAX_SAFE_INTEGER))
      .map((u) => ({
        id: u.id,
        name: u.name,
        departmentId: u.department?.id ?? null,
        departmentName: u.department?.name ?? null,
        isAppointer: u.roles.some((r) => APPOINTER_ROLES.includes(r.role.code)),
        roleLabel: roleLabelOf(u.roles),
      }));
  }

  /**
   * 部署サマリー(要望): 部署のアポインター全員分の日別の値をまとめて返す。集計は画面側(シートの累計と同じ計算)。
   * departmentId='none' は部署なしの人
   */
  async department(departmentId: string, month: string) {
    const members = (await this.users()).filter((u) => (u.departmentId ?? 'none') === departmentId);
    const days = periodMonthDays(month);
    const ids = members.map((m) => m.id);
    const [rows, roles, src] = await Promise.all([
      this.prisma.personalDailyStat.findMany({ where: { userId: { in: ids }, date: { gte: days[0], lte: days[days.length - 1] } } }),
      this.prisma.userRole.findMany({ where: { userId: { in: ids } }, select: { userId: true, role: { select: { code: true } } } }),
      this.loadAutoSource(month),
    ]);
    return {
      month,
      days,
      members: members.map((m) => {
        const values: Record<string, Record<string, { value: number; version: number }>> = {};
        for (const r of rows) if (r.userId === m.id) (values[r.date] ??= {})[r.metricKey] = { value: r.value, version: r.version };
        const target = { id: m.id, name: m.name, roles: roles.filter((r) => r.userId === m.id).map((r) => ({ role: r.role })) };
        return { user: { id: m.id, name: m.name }, roleLabel: m.roleLabel, values, auto: this.computeAuto(target, src) };
      }),
    };
  }

  /** 対象ユーザーを見られる/編集できるか(要望: 営業系の役職の人のシートは誰でも変更できる) */
  private async assertAccess(viewer: AuthenticatedUser, userId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, name: true, teamId: true, departmentId: true, roles: { select: { role: { select: { code: true, name: true } } } } },
    });
    if (!target) throw new NotFoundException('ユーザーが見つかりません');
    const scope = scopeOf(viewer);
    const ok =
      target.id === viewer.id ||
      scope === 'ALL' ||
      (scope === 'DEPT' && !!viewer.departmentId && target.departmentId === viewer.departmentId) ||
      (scope === 'TEAM' && !!viewer.teamId && target.teamId === viewer.teamId) ||
      target.roles.some((r) => SALES_ROLES.includes(r.role.code));
    if (!ok) throw new ForbiddenException('このユーザーのシートを見る権限がありません');
    return target;
  }

  async sheet(viewer: AuthenticatedUser, userId: string, month: string) {
    const target = await this.assertAccess(viewer, userId);
    const days = periodMonthDays(month);
    const [rows, targets, auto] = await Promise.all([
      this.prisma.personalDailyStat.findMany({ where: { userId, date: { gte: days[0], lte: days[days.length - 1] } } }),
      this.prisma.personalStatTarget.findMany({ where: { userId, month } }),
      this.autoValues(target, month),
    ]);

    const values: Record<string, Record<string, { value: number; version: number }>> = {};
    for (const r of rows) (values[r.date] ??= {})[r.metricKey] = { value: r.value, version: r.version };

    return {
      user: { id: target.id, name: target.name },
      month,
      days,
      metrics: METRICS,
      isAppointer: target.roles.some((r) => APPOINTER_ROLES.includes(r.role.code)),
      roleLabel: roleLabelOf(target.roles),
      values,
      auto,
      targets: Object.fromEntries(
        targets.map((t) => [t.metricKey, { weeklyStory: t.weeklyStory, monthlyGoal: t.monthlyGoal, version: t.version }]),
      ),
      canEditTargets: isAdmin(viewer),
      /** 他の AP のシートは見るだけ(編集は自分の範囲) */
    };
  }

  /**
   * システム上の実績から日別の値を出す(手入力が無い日の初期値。サマリーと同じ照合の仕方)。
   * - トスアップ数: トス実績の「AP」が本人(またはトス担当者)のトス件数(トス日)
   * - アポイント数: そのうち進捗が「前確OK」のもの(トス日)+アポ登録で作った本人のアポ詳細(作成日)
   * - 商談実施数・重説OK数・ET数: アポ詳細の「AP」が本人(役職がCLの人は「CL」が本人)のもの
   *   (商談日・重説OK日・ET日)
   */
  private async autoValues(target: AutoTarget, month: string) {
    return this.computeAuto(target, await this.loadAutoSource(month));
  }

  /** 月のトス・アポをまとめて読む(部署サマリーでは全員分を1回で済ませる) */
  private async loadAutoSource(month: string) {
    const { start, end } = periodMonthRange(month);
    const inRange = { gte: start, lt: end };
    const [statuses, tosses, appointments] = await Promise.all([
      this.prisma.statusMaster.findMany({ select: { id: true, internalCode: true, displayName: true } }),
      this.prisma.tossCase.findMany({
        where: { deletedAt: null, receivedAt: inRange },
        select: { receivedAt: true, apStaffName: true, tossUserId: true, progressStatusId: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          deletedAt: null,
          OR: [
            { meetingStartAt: inRange },
            { importantMattersOkAt: inRange },
            { electronicContractAt: inRange },
            { createdAt: inRange, idempotencyKey: { startsWith: 'apo-form:' } },
          ],
        },
        select: {
          idempotencyKey: true,
          createdAt: true,
          apStaffName: true,
          closerStatusId: true,
          meetingStatusId: true,
          meetingStartAt: true,
          importantMattersOkAt: true,
          electronicContractAt: true,
        },
      }),
    ]);
    return { start, end, statuses, tosses, appointments };
  }

  private computeAuto(target: AutoTarget, src: AutoSource): Record<string, Record<string, number>> {
    const { start, end, statuses, tosses, appointments } = src;
    const name = norm(target.name);
    const isCl = target.roles.some((r) => r.role.code === 'CL');
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    const st = (id: string | null) => (id ? statusById.get(id) : undefined);
    const isPreOk = (id: string | null) => matches(st(id), ['PROGRESS_PRE_CONFIRM_OK'], ['前確OK']);
    const isMeetingDone = (id: string | null) =>
      matches(
        st(id),
        ['APO_MEETING_DONE', 'APO_RESCHEDULE', 'APO_REVISIT', 'APO_CONTRACTED', 'APO_ON_HOLD', 'APO_LOST'],
        ['商談完了', '再商談', '再訪問', '成約', '保留', '失注'],
      );

    const out: Record<string, Record<string, number>> = {};
    const add = (d: Date | null, key: string) => {
      if (!d || d < start || d >= end) return;
      const day = (out[jstDateKey(d)] ??= {});
      day[key] = (day[key] ?? 0) + 1;
    };

    if (name) {
      for (const t of tosses) {
        if (t.tossUserId !== target.id && norm(t.apStaffName) !== name) continue;
        add(t.receivedAt, 'TOSS_UP');
        if (isPreOk(t.progressStatusId)) add(t.receivedAt, 'APPOINTMENT');
      }
      for (const a of appointments) {
        const mine = isCl ? norm(st(a.closerStatusId)?.displayName) === name : norm(a.apStaffName) === name;
        if (!mine) continue;
        if (a.idempotencyKey?.startsWith('apo-form:') && norm(a.apStaffName) === name) add(a.createdAt, 'APPOINTMENT');
        if (isMeetingDone(a.meetingStatusId)) add(a.meetingStartAt, 'MEETING');
        add(a.importantMattersOkAt, 'JUSETSU_OK');
        add(a.electronicContractAt, 'ET');
      }
    }
    return out;
  }

  /** 部署ストーリーを見られる・入力できるか: 全員を見られる人は全部署、それ以外は自分の部署だけ */
  private assertStoryAccess(viewer: AuthenticatedUser, departmentId: string) {
    const own = (viewer.departmentId ?? 'none') === departmentId;
    if (scopeOf(viewer) === 'ALL' || own) return;
    throw new ForbiddenException('この部署のストーリーを見る権限がありません');
  }

  async story(viewer: AuthenticatedUser, departmentId: string, month: string) {
    this.assertStoryAccess(viewer, departmentId);
    const rows = await this.prisma.departmentStoryValue.findMany({ where: { departmentId, month } });
    const values: Record<string, { value: number; version: number }> = {};
    for (const r of rows) values[r.cell] = { value: r.value, version: r.version };
    return { month, days: periodMonthDays(month), values };
  }

  /** 部署ストーリーのセルの保存(日別と同じく version で重なりを検出) */
  async saveStory(viewer: AuthenticatedUser, dto: SaveStoryDto) {
    this.assertStoryAccess(viewer, dto.departmentId);
    if (dto.cell.startsWith('d:') && !dto.cell.startsWith(`d:${dto.month}-`)) throw new BadRequestException('対象月の日付ではありません');
    const key = { departmentId: dto.departmentId, month: dto.month, cell: dto.cell };
    let row: { value: number; version: number } | null = null;
    if (dto.version == null) {
      if (dto.value != null) {
        try {
          row = await this.prisma.departmentStoryValue.create({ data: { ...key, value: dto.value, updatedBy: viewer.id } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(CONFLICT_MESSAGE);
          throw e;
        }
      }
    } else if (dto.value == null) {
      const r = await this.prisma.departmentStoryValue.deleteMany({ where: { ...key, version: dto.version } });
      if (r.count === 0) throw new ConflictException(CONFLICT_MESSAGE);
    } else {
      const r = await this.prisma.departmentStoryValue.updateMany({
        where: { ...key, version: dto.version },
        data: { value: dto.value, updatedBy: viewer.id, version: { increment: 1 } },
      });
      if (r.count === 0) throw new ConflictException(CONFLICT_MESSAGE);
      row = await this.prisma.departmentStoryValue.findUnique({ where: { departmentId_month_cell: key } });
    }
    this.realtime.emitToAll('personal-stats.updated', { departmentId: dto.departmentId });
    return row ? { value: row.value, version: row.version } : null;
  }

  /** 日別セルの保存。version で読んだ後の更新を検出し、重なったら 409 にして画面に最新を読み直させる */
  async saveDaily(viewer: AuthenticatedUser, dto: SaveDailyDto) {
    await this.assertAccess(viewer, dto.userId);
    // 着地見込みの手入力は未来日だけ(要望: 当日を含む過去日は実績と同じ)。消すのはいつでもできる
    if (dto.metricKey.endsWith('_REVISED') && dto.value != null && !isLandingEditable(dto.date, todayJst())) {
      throw new BadRequestException('当日までの着地見込みは実績と同じになるため入力できません');
    }
    if (dto.metricKey === 'WORK_MINUTES' && dto.value != null && (dto.value < 60 || dto.value > 480 || dto.value % 15 !== 0)) {
      throw new BadRequestException('稼働時間は1〜8時間を15分刻みで選んでください');
    }
    const key = { userId: dto.userId, date: dto.date, metricKey: dto.metricKey };
    let row: { value: number; version: number } | null = null;

    if (dto.version == null) {
      if (dto.value != null) {
        try {
          row = await this.prisma.personalDailyStat.create({ data: { ...key, value: dto.value, updatedBy: viewer.id } });
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(CONFLICT_MESSAGE);
          throw e;
        }
      }
    } else if (dto.value == null) {
      const r = await this.prisma.personalDailyStat.deleteMany({ where: { ...key, version: dto.version } });
      if (r.count === 0) throw new ConflictException(CONFLICT_MESSAGE);
    } else {
      const r = await this.prisma.personalDailyStat.updateMany({
        where: { ...key, version: dto.version },
        data: { value: dto.value, updatedBy: viewer.id, version: { increment: 1 } },
      });
      if (r.count === 0) throw new ConflictException(CONFLICT_MESSAGE);
      row = await this.prisma.personalDailyStat.findUnique({ where: { userId_date_metricKey: key } });
    }

    this.realtime.emitToAll('personal-stats.updated', { userId: dto.userId });
    return row ? { value: row.value, version: row.version } : null;
  }

  /** 週目標・あるべき姿の保存(管理者のみ) */
  async saveTarget(viewer: AuthenticatedUser, dto: SaveTargetDto) {
    if (!isAdmin(viewer)) throw new ForbiddenException('週目標・あるべき姿は管理者だけが編集できます');
    await this.assertAccess(viewer, dto.userId);
    const key = { userId: dto.userId, month: dto.month, metricKey: dto.metricKey };
    const data: { weeklyStory?: number | null; monthlyGoal?: number | null } = {};
    if (dto.weeklyStory !== undefined) data.weeklyStory = dto.weeklyStory;
    if (dto.monthlyGoal !== undefined) data.monthlyGoal = dto.monthlyGoal;
    if (Object.keys(data).length === 0) throw new BadRequestException('変更する値がありません');

    if (dto.version == null) {
      try {
        await this.prisma.personalStatTarget.create({ data: { ...key, ...data, updatedBy: viewer.id } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(CONFLICT_MESSAGE);
        throw e;
      }
    } else {
      const r = await this.prisma.personalStatTarget.updateMany({
        where: { ...key, version: dto.version },
        data: { ...data, updatedBy: viewer.id, version: { increment: 1 } },
      });
      if (r.count === 0) throw new ConflictException(CONFLICT_MESSAGE);
    }

    this.realtime.emitToAll('personal-stats.updated', { userId: dto.userId });
    const t = await this.prisma.personalStatTarget.findUniqueOrThrow({ where: { userId_month_metricKey: key } });
    return { weeklyStory: t.weeklyStory, monthlyGoal: t.monthlyGoal, version: t.version };
  }
}

@Controller('personal-stats')
class PersonalStatsController {
  constructor(private readonly service: PersonalStatsService) {}

  @Get('users')
  users() {
    return this.service.users();
  }

  @Get()
  sheet(@Query() q: GetSheetQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.service.sheet(user, q.userId, q.month);
  }

  @Get('department')
  department(@Query() q: GetDepartmentQuery) {
    return this.service.department(q.departmentId, q.month);
  }

  @Get('story')
  story(@Query() q: GetStoryQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.service.story(user, q.departmentId, q.month);
  }

  @Put('story')
  saveStory(@Body() dto: SaveStoryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.saveStory(user, dto);
  }

  @Put('daily')
  saveDaily(@Body() dto: SaveDailyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.saveDaily(user, dto);
  }

  @Put('targets')
  saveTarget(@Body() dto: SaveTargetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.saveTarget(user, dto);
  }
}

@Module({
  controllers: [PersonalStatsController],
  providers: [PersonalStatsService],
})
export class PersonalStatsModule {}
