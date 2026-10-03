import { BadRequestException, Body, Controller, Get, Injectable, Module, Put, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

/**
 * 部署別サマリー(要望)。部署(ユーザー管理の所属)ごとに、1人1行で月の実績を並べる。
 *
 * 定義(ユーザーと確認済み):
 * - 稼働時間: シフト表の日別稼働時間の月間累計
 * - 稼働人数 = 稼働時間 ÷ 8、席数 = 稼働時間 ÷ 176(画面で小数第2位まで)
 * - 予算(トスアップ/前確OK/商談実施/商談成約/成約拠点): 手入力
 * - コール数: 最終報告の コール数(SF)+コール数(白地) の月合計、DPH = コール数 ÷ 稼働時間
 * - トス側(前確OK・通過率・有効前確OK): トス実績の「AP」が本人の名前のもの
 * - アポ側(商談実施・ET・リスケ・前連失注・残訪問・Pt): アポ実績の「AP」が本人の名前のもの。
 *   役職がCLの人は、アポ実績の「CL」が本人の名前のもの
 * - 成約拠点: 当面は数えない(空欄)
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const BUDGET_KEYS = ['tossUp', 'preOk', 'meeting', 'contract', 'contractSites'] as const;

/** 名前の照合用: 全角/半角・空白の違いを吸収する */
const norm = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, '').trim();

/** マスタの選択肢を「内部コード または 表示名」で判定する(画面から追加した選択肢は内部コードが自動採番のため) */
const matches = (opt: { internalCode: string; displayName: string } | undefined, codes: string[], names: string[]) =>
  !!opt && (codes.includes(opt.internalCode) || names.includes(opt.displayName.trim()));

class BudgetDto {
  @Matches(PERIOD_RE) period!: string;
  @IsString() userId!: string;
  @IsIn(BUDGET_KEYS as unknown as string[]) key!: string;
  /** 空文字で未入力に戻す */
  @IsOptional() @IsString() @MaxLength(20) value?: string;
}

@Injectable()
class DepartmentSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async build(period: string) {
    if (!PERIOD_RE.test(period)) throw new BadRequestException('対象月の形式が正しくありません');

    const [departments, users, statuses, shiftRows, reportFields, entries, tosses, appointments, budgets] = await Promise.all([
      this.prisma.department.findMany({ where: { active: true }, orderBy: { order: 'asc' } }),
      this.prisma.user.findMany({
        where: { deletedAt: null, status: { not: 'RETIRED' } },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, departmentId: true, roles: { select: { role: { select: { code: true } } } } },
      }),
      this.prisma.statusMaster.findMany({ select: { id: true, category: true, internalCode: true, displayName: true } }),
      this.prisma.monthlyShiftRow.findMany({ where: { sheet: { periodMonth: period }, userId: { not: null } }, select: { userId: true, days: true } }),
      this.prisma.finalReportField.findMany({ where: { code: { in: ['callSf', 'callBlank'] } }, select: { id: true } }),
      this.prisma.finalReportEntry.findMany({ where: { date: { startsWith: period } }, select: { userId: true, values: true } }),
      this.prisma.tossCase.findMany({
        where: { deletedAt: null, periodMonth: period },
        select: { id: true, apStaffName: true, progressStatusId: true },
      }),
      this.prisma.appointment.findMany({
        where: { deletedAt: null, periodMonth: period },
        select: { tossCaseId: true, apStaffName: true, closerStatusId: true, progressStatusId: true, meetingStatusId: true, anshinBizPoints: true },
      }),
      this.prisma.summaryBudget.findMany({ where: { periodMonth: period } }),
    ]);

    const statusById = new Map(statuses.map((s) => [s.id, s]));
    const st = (id: string | null) => (id ? statusById.get(id) : undefined);

    // 稼働時間(シフト表の日別の月間累計)
    const hours = new Map<string, number>();
    for (const r of shiftRows) {
      const days = (r.days ?? {}) as Record<string, unknown>;
      const sum = Object.entries(days)
        .filter(([d]) => d.startsWith(period))
        .reduce((a, [, v]) => a + (Number(v) || 0), 0);
      hours.set(r.userId!, (hours.get(r.userId!) ?? 0) + sum);
    }

    // コール数(最終報告 SF + 白地)
    const callFieldIds = reportFields.map((f) => f.id);
    const calls = new Map<string, number>();
    for (const e of entries) {
      const v = (e.values ?? {}) as Record<string, unknown>;
      const n = callFieldIds.reduce((a, id) => a + (Number(v[id]) || 0), 0);
      calls.set(e.userId, (calls.get(e.userId) ?? 0) + n);
    }

    // 判定に使う選択肢
    const isPreOk = (id: string | null) => matches(st(id), ['PROGRESS_APPOINTMENT', 'PROGRESS_PRE_CONFIRM_OK'], ['アポイント', '前確OK']);
    const isInvalidAppo = (id: string | null) =>
      matches(st(id), ['PROG_CANCELLED', 'PROG_NO_TRANSFER', 'PROG_BACK_TO_AP'], ['キャンセル', '取次不可', 'AP戻し']);
    const isEt = (id: string | null) => matches(st(id), ['PROG_ET'], ['ET']);
    const isResche = (id: string | null) => matches(st(id), ['PROG_RESCHEDULE'], ['リスケ']);
    const isZenren = (id: string | null) => matches(st(id), ['PROG_LOST_ZENREN'], ['前連失注']);
    const isMeetingDone = (id: string | null) =>
      matches(
        st(id),
        ['APO_MEETING_DONE', 'APO_RESCHEDULE', 'APO_REVISIT', 'APO_CONTRACTED', 'APO_ON_HOLD', 'APO_LOST'],
        ['商談完了', '再商談', '再訪問', '成約', '保留', '失注'],
      );
    const isRemaining = (id: string | null) => matches(st(id), ['APO_CONFIRMED', 'APO_BEFORE_MEETING'], ['アポ確定', '商談前']);

    const appoByToss = new Map(appointments.filter((a) => a.tossCaseId).map((a) => [a.tossCaseId!, a]));
    const budgetOf = new Map(budgets.map((b) => [b.userId, (b.values ?? {}) as Record<string, string>]));

    const rowFor = (u: (typeof users)[number]) => {
      const name = norm(u.name);
      const roles = u.roles.map((r) => r.role.code);
      const isCl = roles.includes('CL');
      const myTosses = name ? tosses.filter((t) => norm(t.apStaffName) === name) : [];
      const preOk = myTosses.filter((t) => isPreOk(t.progressStatusId));
      const validPreOk = preOk.filter((t) => !isInvalidAppo(appoByToss.get(t.id)?.progressStatusId ?? null));
      // アポ側: CLは「CL」欄が本人、それ以外は「AP」欄が本人の案件
      const myAppos = !name
        ? []
        : appointments.filter((a) => (isCl ? norm(st(a.closerStatusId)?.displayName) === name : norm(a.apStaffName) === name));
      const h = hours.get(u.id) ?? 0;
      const c = calls.get(u.id) ?? 0;
      return {
        userId: u.id,
        name: u.name,
        roles,
        departmentId: u.departmentId,
        workHours: h,
        calls: c,
        tossCount: myTosses.length,
        preOk: preOk.length,
        validPreOk: validPreOk.length,
        meetingDone: myAppos.filter((a) => isMeetingDone(a.meetingStatusId)).length,
        et: myAppos.filter((a) => isEt(a.progressStatusId)).length,
        reschedule: myAppos.filter((a) => isResche(a.progressStatusId)).length,
        zenrenLost: myAppos.filter((a) => isZenren(a.progressStatusId)).length,
        remainingVisit: myAppos.filter((a) => isRemaining(a.meetingStatusId)).length,
        points: myAppos.reduce((a, x) => a + (x.anshinBizPoints ?? 0), 0),
        budget: budgetOf.get(u.id) ?? {},
      };
    };

    const rows = users.map(rowFor);
    return {
      period,
      departments: [
        ...departments.map((d) => ({ id: d.id, name: d.name, rows: rows.filter((r) => r.departmentId === d.id) })),
        { id: 'none', name: '所属なし', rows: rows.filter((r) => !r.departmentId || !departments.some((d) => d.id === r.departmentId)) },
      ].filter((d) => d.rows.length > 0),
    };
  }

  async setBudget(dto: BudgetDto, userId: string) {
    const v = (dto.value ?? '').trim();
    if (v && !/^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ''))) throw new BadRequestException('予算は数値で入力してください');
    const existing = await this.prisma.summaryBudget.findUnique({ where: { periodMonth_userId: { periodMonth: dto.period, userId: dto.userId } } });
    const values = { ...((existing?.values ?? {}) as Record<string, string>) };
    if (v) values[dto.key] = v.replace(/,/g, '');
    else delete values[dto.key];
    await this.prisma.summaryBudget.upsert({
      where: { periodMonth_userId: { periodMonth: dto.period, userId: dto.userId } },
      update: { values: values as Prisma.InputJsonValue, updatedBy: userId },
      create: { periodMonth: dto.period, userId: dto.userId, values: values as Prisma.InputJsonValue, updatedBy: userId },
    });
    this.realtime.emitToAll('department-summary.updated', { period: dto.period });
    return { ok: true };
  }
}

@Controller('department-summary')
class DepartmentSummaryController {
  constructor(private readonly service: DepartmentSummaryService) {}

  @Get()
  get(@Query('period') period: string) {
    return this.service.build(period);
  }

  @Put('budget')
  budget(@Body() dto: BudgetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.setBudget(dto, user.id);
  }
}

@Module({
  providers: [DepartmentSummaryService],
  controllers: [DepartmentSummaryController],
})
export class DepartmentSummaryModule {}
