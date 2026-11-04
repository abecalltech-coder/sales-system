import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  Body,
  CanActivate,
  ConflictException,
  Controller,
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

/** CB管理のタブ(ユーザー管理の「役職ごとのタブ表示」で出し入れする) */
const CB_TAB = '/cb-cases';
/** ステータスの選択肢(要望) */
export const CB_STATUSES = ['MC待ち', 'MC済み', '情報回収中', '申請済み'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

class SaveCbCaseDto {
  @IsOptional() @IsString() @MaxLength(300) caseName?: string;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DATE_RE) contractDate?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @Matches(DATE_RE) mcDate?: string | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsInt() @Min(-100_000_000) @Max(100_000_000) cbAmount?: number | null;
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsIn(CB_STATUSES) status?: string | null;
  @IsOptional() @IsString() @MaxLength(20_000) memo?: string;
}

class UpdateCbCaseDto extends SaveCbCaseDto {
  @IsInt() version!: number;
}

class BulkIdsDto {
  @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) ids!: string[];
}

/** タブ制限なし(null)の役職と管理者は使える。画面のタブだけでなく API でも同じ判定をする */
@Injectable()
class CbTabGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) return false;
    const isAdmin = user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');
    if (isAdmin || !user.visibleTabs || user.visibleTabs.includes(CB_TAB)) return true;
    throw new ForbiddenException('CB管理を使う権限がありません(ユーザー管理の役職ごとのタブ表示で設定します)');
  }
}

/** 渡された項目だけを更新用に取り出す(すべて任意) */
const pick = (dto: SaveCbCaseDto) => ({
  ...(dto.caseName !== undefined ? { caseName: dto.caseName.trim() } : {}),
  ...(dto.contractDate !== undefined ? { contractDate: dto.contractDate } : {}),
  ...(dto.mcDate !== undefined ? { mcDate: dto.mcDate } : {}),
  ...(dto.cbAmount !== undefined ? { cbAmount: dto.cbAmount } : {}),
  ...(dto.status !== undefined ? { status: dto.status } : {}),
  ...(dto.memo !== undefined ? { memo: dto.memo } : {}),
});

/** CB管理(要望: CBの案件を登録して一覧で管理する。全員で共有) */
@Injectable()
class CbCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private changed() {
    this.realtime.emitToAll('cb-cases.updated', {});
  }

  list() {
    return this.prisma.cbCase.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: SaveCbCaseDto, userId: string) {
    const created = await this.prisma.cbCase.create({ data: { ...pick(dto), createdBy: userId, updatedBy: userId } });
    this.changed();
    return created;
  }

  async update(id: string, dto: UpdateCbCaseDto, userId: string) {
    const existing = await this.prisma.cbCase.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('案件が見つかりません');
    const r = await this.prisma.cbCase.updateMany({
      where: { id, version: dto.version, deletedAt: null },
      data: { ...pick(dto), updatedBy: userId, version: { increment: 1 } },
    });
    if (r.count === 0) throw new ConflictException('他のユーザーが先に更新しました。最新の内容を表示します');
    this.changed();
    return this.prisma.cbCase.findUniqueOrThrow({ where: { id } });
  }

  /** 一覧の右クリック(長押し)メニューからの削除。論理削除 */
  async bulkDelete(ids: string[], userId: string) {
    const r = await this.prisma.cbCase.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date(), updatedBy: userId } });
    this.changed();
    return { ok: true, deleted: r.count };
  }
}

@UseGuards(CbTabGuard)
@Controller('cb-cases')
class CbCasesController {
  constructor(private readonly service: CbCasesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: SaveCbCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkIdsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.bulkDelete(dto.ids, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCbCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.id);
  }
}

@Module({ providers: [CbCasesService], controllers: [CbCasesController] })
export class CbCasesModule {}
