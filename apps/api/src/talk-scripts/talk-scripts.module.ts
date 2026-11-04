import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
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
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

/** トークスクリプトのタブ(ユーザー管理の「役職ごとのタブ表示」で出し入れする) */
const TALK_TAB = '/talk-scripts';
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
/** APランク(要望)。ユーザー管理の User.talkRank と同じ値 */
export const TALK_RANKS = ['BRONZE', 'SILVER', 'GOLD'];

class CreateStepDto {
  @IsIn(TALK_RANKS) rank!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
}

class UpdateStepDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) outIds?: string[];
}

class CreateOutDto {
  @IsArray() @ArrayMinSize(1) @IsIn(TALK_RANKS, { each: true }) ranks!: string[];
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
}

class UpdateOutDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsIn(TALK_RANKS, { each: true }) ranks?: string[];
  @IsOptional() @IsString() @MaxLength(100) label?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(20_000) body?: string;
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
 * トークはランクごと。アウトは「使うランク」を選べて、複数のランクで同じ内容を使い回せる。
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
    const updated = await this.prisma.talkStep.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
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

  async createOut(dto: CreateOutDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const max = await this.prisma.talkOut.aggregate({ where: { deletedAt: null }, _max: { order: true } });
    const created = await this.prisma.talkOut.create({
      data: {
        ranks: [...new Set(dto.ranks)],
        label: dto.label?.trim() ?? '',
        category: dto.category?.trim() ?? '',
        body: dto.body ?? '',
        order: (max._max.order ?? -1) + 1,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    this.changed();
    return created;
  }

  async updateOut(id: string, dto: UpdateOutDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const existing = await this.prisma.talkOut.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('アウトが見つかりません');
    const updated = await this.prisma.talkOut.update({
      where: { id },
      data: {
        ...(dto.ranks !== undefined ? { ranks: [...new Set(dto.ranks)] } : {}),
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
