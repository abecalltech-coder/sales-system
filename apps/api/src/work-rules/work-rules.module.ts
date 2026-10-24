import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

class SaveRuleDto {
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100_000) body?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

class SaveGroupDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsInt() order?: number;
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];

/**
 * 稼働ルール(要望: 様々なルールをグループ(ジャンル)ごとに一覧で確認できる)。
 * 閲覧は全員。作成・編集・削除はユーザー管理の役職ごとの「稼働ルールの編集」で許可した人(管理者は常に可)。
 */
@Injectable()
class WorkRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async canEdit(user: AuthenticatedUser) {
    if (user.roles.some((r) => ADMIN_ROLES.includes(r))) return true;
    const n = await this.prisma.role.count({ where: { code: { in: user.roles }, canEditWorkRules: true } });
    return n > 0;
  }

  private async assertCanEdit(user: AuthenticatedUser) {
    if (!(await this.canEdit(user))) throw new ForbiddenException('稼働ルールを編集する権限がありません(ユーザー管理の役職ごとの設定で許可します)');
  }

  private changed() {
    this.realtime.emitToAll('work-rules.updated', {});
  }

  async list(user: AuthenticatedUser) {
    const [groups, rules, canEdit] = await Promise.all([
      this.prisma.workRuleGroup.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.workRule.findMany({ where: { deletedAt: null }, orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }] }),
      this.canEdit(user),
    ]);
    // 作成者・最終編集者の名前(退職者も名前は出す)
    const ids = [...new Set(rules.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);
    return {
      canEdit,
      groups: groups.map((g) => ({ id: g.id, name: g.name, order: g.order, count: rules.filter((r) => r.groupId === g.id).length })),
      rules: rules.map((r) => ({ ...r, createdByName: nameOf(r.createdBy), updatedByName: nameOf(r.updatedBy) })),
    };
  }

  private async group(id: string) {
    const g = await this.prisma.workRuleGroup.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('グループが見つかりません');
    return g;
  }

  private async rule(id: string) {
    const r = await this.prisma.workRule.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw new NotFoundException('ルールが見つかりません');
    return r;
  }

  async create(dto: SaveRuleDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    if (!dto.groupId) throw new BadRequestException('グループを選んでください');
    await this.group(dto.groupId);
    const created = await this.prisma.workRule.create({
      data: {
        groupId: dto.groupId,
        title: dto.title?.trim() || '無題のルール',
        body: dto.body ?? '',
        pinned: dto.pinned ?? false,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    this.changed();
    return created;
  }

  async update(id: string, dto: SaveRuleDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.rule(id);
    if (dto.groupId) await this.group(dto.groupId);
    const updated = await this.prisma.workRule.update({
      where: { id },
      data: {
        ...(dto.groupId ? { groupId: dto.groupId } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() || '無題のルール' } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
        updatedBy: user.id,
      },
    });
    this.changed();
    return updated;
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.rule(id);
    await this.prisma.workRule.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: user.id } });
    this.changed();
    return { ok: true };
  }

  async createGroup(dto: SaveGroupDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('グループ名を入力してください');
    // 追加したグループは一番下へ
    const max = await this.prisma.workRuleGroup.aggregate({ _max: { order: true } });
    const created = await this.prisma.workRuleGroup.create({ data: { name, order: (max._max.order ?? 0) + 1 } });
    this.changed();
    return created;
  }

  async updateGroup(id: string, dto: SaveGroupDto, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.group(id);
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw new BadRequestException('グループ名を入力してください');
    const updated = await this.prisma.workRuleGroup.update({
      where: { id },
      data: { ...(name ? { name } : {}), ...(dto.order !== undefined ? { order: dto.order } : {}) },
    });
    this.changed();
    return updated;
  }

  async removeGroup(id: string, user: AuthenticatedUser) {
    await this.assertCanEdit(user);
    await this.group(id);
    // うっかり消さないよう、ルールが入っているグループは消せない
    const n = await this.prisma.workRule.count({ where: { groupId: id, deletedAt: null } });
    if (n > 0) throw new BadRequestException(`このグループには${n}件のルールがあります。先に別のグループへ移動するか削除してください`);
    // 削除済みルールの参照が残っていてもグループは消せるように、削除済み分も外す
    await this.prisma.$transaction([
      this.prisma.workRule.deleteMany({ where: { groupId: id, deletedAt: { not: null } } }),
      this.prisma.workRuleGroup.delete({ where: { id } }),
    ]);
    this.changed();
    return { ok: true };
  }
}

@Controller('work-rules')
class WorkRulesController {
  constructor(private readonly rules: WorkRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rules.list(user);
  }

  @Post()
  create(@Body() dto: SaveRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.create(dto, user);
  }

  @Post('groups')
  createGroup(@Body() dto: SaveGroupDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.createGroup(dto, user);
  }

  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() dto: SaveGroupDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.updateGroup(id, dto, user);
  }

  @Delete('groups/:id')
  removeGroup(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.removeGroup(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.update(id, dto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.remove(id, user);
  }
}

@Module({ providers: [WorkRulesService], controllers: [WorkRulesController] })
export class WorkRulesModule {}
