import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

/** トークスクリプトのタブ(ユーザー管理の「役職ごとのタブ表示」で出し入れする) */
const TALK_TAB = '/talk-scripts';
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
/** APランク(要望)。ユーザー管理の User.talkRank と同じ値 */
export const TALK_RANKS = ['BRONZE', 'SILVER', 'GOLD'];

/** 文字色・塗りつぶし付きの文字(要望)。t=文字(改行は \n)、c=文字色、b=塗りつぶし(#rrggbb) */
type RichRun = { t: string; c?: string; b?: string };
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 画面から来た色付きの文字を検証して整える。色は #rrggbb だけ受け付け、同じ色が続く部分はまとめる。
 * 色が1つも無ければ null(= 色なし。プレーンの文字をそのまま表示)
 */
export function cleanRich(raw: unknown, max = 20_000): RichRun[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length > 5000) throw new BadRequestException('文字の形式が正しくありません');
  const out: RichRun[] = [];
  let total = 0;
  for (const r of raw) {
    if (!r || typeof r !== 'object' || typeof (r as RichRun).t !== 'string') throw new BadRequestException('文字の形式が正しくありません');
    const run = r as RichRun;
    const c = typeof run.c === 'string' && COLOR_RE.test(run.c) ? run.c.toLowerCase() : undefined;
    const b = typeof run.b === 'string' && COLOR_RE.test(run.b) ? run.b.toLowerCase() : undefined;
    if (!run.t) continue;
    total += run.t.length;
    const last = out[out.length - 1];
    if (last && last.c === c && last.b === b) last.t += run.t;
    else out.push({ t: run.t, ...(c ? { c } : {}), ...(b ? { b } : {}) });
  }
  if (total > max) throw new BadRequestException('文字が長すぎます');
  return out.some((r) => r.c || r.b) ? out : null;
}
const plainOf = (runs: RichRun[] | null) => (runs ? runs.map((r) => r.t).join('') : null);
const richJson = (runs: RichRun[] | null) => (runs ? (runs as unknown as Prisma.InputJsonValue) : Prisma.DbNull);

class CreateStepDto {
  @IsIn(TALK_RANKS) rank!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
}

class UpdateStepDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
  /** 色付きの題名・文面(name/body も同じ文字で送る)。null で色を外す */
  @IsOptional() nameRich?: unknown;
  @IsOptional() bodyRich?: unknown;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) outIds?: string[];
}

class CreateOutDto {
  /** アウト返しを作るベーストークの項目(要望: チェックで複数選ぶと、項目ごとに別々のアウト返しを作る) */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) stepIds!: string[];
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
  @IsOptional() labelRich?: unknown;
  @IsOptional() bodyRich?: unknown;
  /**
   * アウト返しのあとに戻るトーク(要望)。'same'=アウトが出たトーク / 'next'=その次のトーク / トークのID(同じランクのアウトにだけ使う)。
   * 省略時は 'same'
   */
  @IsOptional() @IsString() returnTo?: string;
}

class UpdateOutDto {
  /** 別のベーストークの項目へ移す */
  @IsOptional() @IsString() stepId?: string;
  /** 戻るトーク。空文字でアウトが出たトークに戻す */
  @IsOptional() @IsString() returnStepId?: string;
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
  @IsOptional() labelRich?: unknown;
  @IsOptional() bodyRich?: unknown;
}

class CopyStepsDto {
  /** 複製するベーストークの項目(要望: チェックで選んで他のランクへ複製) */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) stepIds!: string[];
  /** 複製先のランク */
  @IsArray() @ArrayMinSize(1) @IsIn(TALK_RANKS, { each: true }) ranks!: string[];
}

class ReorderDto {
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) ids!: string[];
}

/** タブ制限なし(null)の役職と管理者は使える。画面のタブだけでなく API でも同じ判定をする */
@Injectable()
class TalkTabGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) return false;
    if (user.roles.some((r) => ADMIN_ROLES.includes(r)) || !user.visibleTabs || user.visibleTabs.includes(TALK_TAB)) return true;
    throw new ForbiddenException('トークスクリプトを見る権限がありません(ユーザー管理の役職ごとのタブ表示で設定します)');
  }
}

/**
 * トークスクリプト(要望: APのランクごとのベーストークとアウト返し集)。
 * トークはランクごと。アウト返しはベーストークの項目ごとに持ち、作成時に複数の項目を選ぶと項目ごとに別々に作る。
 * 閲覧はタブが見える人全員で全ランク。編集はユーザー管理の役職ごとの設定で許可した人(管理者は常に可)。
 */
@Injectable()
export class TalkScriptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private changed() {
    this.realtime.emitToAll('talk-scripts.updated', {});
  }

  async canEdit(user: AuthenticatedUser) {
    if (user.roles.some((r) => ADMIN_ROLES.includes(r))) return true;
    return (await this.prisma.role.count({ where: { code: { in: user.roles }, canEditTalkScripts: true } })) > 0;
  }

  private async assertCanEdit(user: AuthenticatedUser) {
    if (!(await this.canEdit(user))) throw new ForbiddenException('トークスクリプトを編集する権限がありません(ユーザー管理の役職ごとの設定で許可します)');
  }

  async list(user: AuthenticatedUser) {
    const [steps, outs, me, canEdit] = await Promise.all([
      this.prisma.talkStep.findMany({ where: { deletedAt: null }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.talkOut.findMany({ where: { deletedAt: null }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.user.findUnique({ where: { id: user.id }, select: { talkRank: true } }),
      this.canEdit(user),
    ]);
    return { canEdit, myRank: me?.talkRank ?? null, steps, outs };
  }

  async createStep(dto: CreateStepDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const max = await this.prisma.talkStep.aggregate({ where: { rank: dto.rank, deletedAt: null }, _max: { order: true } });
    const created = await this.prisma.talkStep.create({
      data: { rank: dto.rank, name: dto.name?.trim() ?? '', body: dto.body ?? '', order: (max._max.order ?? -1) + 1, createdBy: user.id, updatedBy: user.id },
    });
    this.changed();
    return created;
  }

  async updateStep(id: string, dto: UpdateStepDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const existing = await this.prisma.talkStep.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('トークが見つかりません');
    // 色付きで送られたときは、検索などに使うプレーンの文字も同じ内容にそろえる
    const nameRich = dto.nameRich !== undefined ? cleanRich(dto.nameRich, 100) : undefined;
    const bodyRich = dto.bodyRich !== undefined ? cleanRich(dto.bodyRich) : undefined;
    const updated = await this.prisma.talkStep.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(nameRich !== undefined ? { nameRich: richJson(nameRich), ...(nameRich ? { name: plainOf(nameRich)! } : {}) } : {}),
        ...(bodyRich !== undefined ? { bodyRich: richJson(bodyRich), ...(bodyRich ? { body: plainOf(bodyRich)! } : {}) } : {}),
        ...(dto.outIds !== undefined ? { outIds: [...new Set(dto.outIds)] } : {}),
        updatedBy: user.id,
      },
    });
    this.changed();
    return updated;
  }

  async removeStep(id: string, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.prisma.talkStep.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), updatedBy: user.id } });
    this.changed();
    return { ok: true };
  }

  /**
   * アウト返しの作成(要望)。選んだベーストークの項目ごとに、同じ内容の別々のアウト返しを作る。
   * 作ったあとは項目ごとに編集でき、他の項目には影響しない。
   */
  async createOut(dto: CreateOutDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const stepIds = [...new Set(dto.stepIds)];
    const steps = await this.prisma.talkStep.findMany({ where: { id: { in: stepIds }, deletedAt: null }, select: { id: true, rank: true } });
    if (steps.length !== stepIds.length) throw new NotFoundException('選んだトークが見つかりません。画面を読み直してください');
    // 戻るトーク: 「次のトーク」はランクごとの並びで決め、トーク指定は同じランクのアウトにだけ使う(他のランクは出たトークに戻る)
    const returnTo = dto.returnTo ?? 'same';
    const rankSteps = await this.prisma.talkStep.findMany({
      where: { rank: { in: [...new Set(steps.map((s) => s.rank))] }, deletedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, rank: true },
    });
    const returnOf = (step: { id: string; rank: string }): string | null => {
      if (returnTo === 'same') return null;
      const list = rankSteps.filter((s) => s.rank === step.rank);
      if (returnTo === 'next') {
        const i = list.findIndex((s) => s.id === step.id);
        return list[i + 1]?.id ?? null;
      }
      return list.some((s) => s.id === returnTo) ? returnTo : null;
    };
    const max = await this.prisma.talkOut.aggregate({ where: { deletedAt: null }, _max: { order: true } });
    const order = (max._max.order ?? -1) + 1;
    const labelRich = cleanRich(dto.labelRich, 100);
    const bodyRich = cleanRich(dto.bodyRich);
    const created = await this.prisma.$transaction(
      stepIds.map((stepId) =>
        this.prisma.talkOut.create({
          data: {
            stepId,
            returnStepId: returnOf(steps.find((s) => s.id === stepId)!),
            ranks: [steps.find((s) => s.id === stepId)!.rank],
            label: plainOf(labelRich) ?? dto.label?.trim() ?? '',
            category: dto.category?.trim() ?? '',
            body: plainOf(bodyRich) ?? dto.body ?? '',
            labelRich: richJson(labelRich),
            bodyRich: richJson(bodyRich),
            order,
            createdBy: user.id,
            updatedBy: user.id,
          },
        }),
      ),
    );
    this.changed();
    return created;
  }

  async updateOut(id: string, dto: UpdateOutDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const existing = await this.prisma.talkOut.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('アウトが見つかりません');
    const step = dto.stepId ? await this.prisma.talkStep.findFirst({ where: { id: dto.stepId, deletedAt: null }, select: { id: true, rank: true } }) : null;
    if (dto.stepId && !step) throw new NotFoundException('移す先のトークが見つかりません');
    const ret = dto.returnStepId ? await this.prisma.talkStep.findFirst({ where: { id: dto.returnStepId, deletedAt: null }, select: { id: true } }) : null;
    if (dto.returnStepId && !ret) throw new NotFoundException('戻るトークが見つかりません');
    const labelRich = dto.labelRich !== undefined ? cleanRich(dto.labelRich, 100) : undefined;
    const bodyRich = dto.bodyRich !== undefined ? cleanRich(dto.bodyRich) : undefined;
    const updated = await this.prisma.talkOut.update({
      where: { id },
      data: {
        ...(step ? { stepId: step.id, ranks: [step.rank] } : {}),
        ...(dto.returnStepId !== undefined ? { returnStepId: dto.returnStepId || null } : {}),
        ...(labelRich !== undefined ? { labelRich: richJson(labelRich), ...(labelRich ? { label: plainOf(labelRich)! } : {}) } : {}),
        ...(bodyRich !== undefined ? { bodyRich: richJson(bodyRich), ...(bodyRich ? { body: plainOf(bodyRich)! } : {}) } : {}),
        ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        updatedBy: user.id,
      },
    });
    this.changed();
    return updated;
  }

  async removeOut(id: string, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.prisma.talkOut.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), updatedBy: user.id } });
    this.changed();
    return { ok: true };
  }

  /**
   * ベーストークの項目を、選んだランクへ複製する(要望)。項目のアウト返しも一緒に複製する。
   * 複製したものは元とは別のデータで、それぞれ編集しても互いに影響しない。複製先では最後に並ぶ。
   */
  async copySteps(dto: CopyStepsDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const stepIds = [...new Set(dto.stepIds)];
    const steps = await this.prisma.talkStep.findMany({
      where: { id: { in: stepIds }, deletedAt: null },
      orderBy: [{ rank: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
    if (steps.length !== stepIds.length) throw new NotFoundException('選んだトークが見つかりません。画面を読み直してください');
    const outs = await this.prisma.talkOut.findMany({ where: { stepId: { in: stepIds }, deletedAt: null }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    let copied = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const rank of [...new Set(dto.ranks)]) {
        const max = await tx.talkStep.aggregate({ where: { rank, deletedAt: null }, _max: { order: true } });
        let order = (max._max.order ?? -1) + 1;
        // 先にトークを作ってから、アウト返しを作る(戻るトークが一緒に複製したトークなら、複製後のトークへ付け替えるため)
        const newIdOf = new Map<string, string>();
        for (const st of steps) {
          const created = await tx.talkStep.create({
            data: {
              rank,
              name: st.name,
              body: st.body,
              nameRich: st.nameRich ?? Prisma.DbNull,
              bodyRich: st.bodyRich ?? Prisma.DbNull,
              order: order++,
              createdBy: user.id,
              updatedBy: user.id,
            },
          });
          newIdOf.set(st.id, created.id);
          copied++;
        }
        const data = outs.map((o) => ({
          stepId: newIdOf.get(o.stepId!)!,
          // 一緒に複製していないトークへ戻るものは、アウトが出たトークに戻す
          returnStepId: o.returnStepId ? (newIdOf.get(o.returnStepId) ?? null) : null,
          ranks: [rank],
          label: o.label,
          category: o.category,
          body: o.body,
          labelRich: o.labelRich ?? Prisma.DbNull,
          bodyRich: o.bodyRich ?? Prisma.DbNull,
          order: o.order,
          createdBy: user.id,
          updatedBy: user.id,
        }));
        if (data.length > 0) await tx.talkOut.createMany({ data });
      }
    });
    this.changed();
    return { ok: true, copied };
  }

  /** 並び替え。受け取った順に order を振り直す */
  async reorder(kind: 'step' | 'out', ids: string[], user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.prisma.$transaction(
      ids.map((id, order) =>
        kind === 'step' ? this.prisma.talkStep.updateMany({ where: { id }, data: { order } }) : this.prisma.talkOut.updateMany({ where: { id }, data: { order } }),
      ),
    );
    this.changed();
    return { ok: true };
  }
}

@UseGuards(TalkTabGuard)
@Controller('talk-scripts')
class TalkScriptsController {
  constructor(private readonly service: TalkScriptsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  @Post('steps')
  createStep(@Body() dto: CreateStepDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createStep(dto, user);
  }

  @Post('steps/copy')
  copySteps(@Body() dto: CopyStepsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.copySteps(dto, user);
  }

  @Post('steps/reorder')
  reorderSteps(@Body() dto: ReorderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reorder('step', dto.ids, user);
  }

  @Patch('steps/:id')
  updateStep(@Param('id') id: string, @Body() dto: UpdateStepDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateStep(id, dto, user);
  }

  @Delete('steps/:id')
  removeStep(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeStep(id, user);
  }

  @Post('outs')
  createOut(@Body() dto: CreateOutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createOut(dto, user);
  }

  @Post('outs/reorder')
  reorderOuts(@Body() dto: ReorderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reorder('out', dto.ids, user);
  }

  @Patch('outs/:id')
  updateOut(@Param('id') id: string, @Body() dto: UpdateOutDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateOut(id, dto, user);
  }

  @Delete('outs/:id')
  removeOut(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.removeOut(id, user);
  }
}

@Module({ providers: [TalkScriptsService], controllers: [TalkScriptsController] })
export class TalkScriptsModule {}
