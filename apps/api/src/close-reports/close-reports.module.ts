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
  Put,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

/** クローズ報告のタブ(ユーザー管理の「役職ごとのタブ表示」で役職ごとに出し入れする) */
const CLOSE_REPORT_TAB = '/close-reports';
/** 入力項目・選択肢の設定(マスタ管理「クローズ報告」)。未設定なら画面側の既定値を使う */
const CONFIG_KEY = 'closeReportConfig';

class SaveReportDto {
  @IsObject() values!: Record<string, unknown>;
  @IsString() @MaxLength(50_000) text!: string;
  @IsOptional() @IsString() @MaxLength(200) storeName?: string;
}

class SaveConfigDto {
  @IsObject() value!: Record<string, unknown>;
}

/** タブ制限なし(null)の役職と管理者は使える。画面のタブだけでなく API でも同じ判定をする */
@Injectable()
class CloseReportTabGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) return false;
    const isAdmin = user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');
    if (isAdmin || !user.visibleTabs || user.visibleTabs.includes(CLOSE_REPORT_TAB)) return true;
    throw new ForbiddenException('クローズ報告を使う権限がありません(ユーザー管理の役職ごとのタブ表示で設定します)');
  }
}

@Injectable()
class CloseReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async config() {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } });
    return { value: row?.value ?? null };
  }

  async saveConfig(value: Record<string, unknown>) {
    const v = value as Prisma.InputJsonValue;
    await this.prisma.systemSetting.upsert({ where: { key: CONFIG_KEY }, update: { value: v }, create: { key: CONFIG_KEY, value: v } });
    // 開いているフォームにもすぐ反映する
    this.realtime.emitToAll('close-report-config.updated', {});
    return { value };
  }

  list(userId: string) {
    return this.prisma.closeReport.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  create(userId: string, dto: SaveReportDto) {
    return this.prisma.closeReport.create({
      data: { userId, values: dto.values as Prisma.InputJsonValue, text: dto.text, storeName: dto.storeName?.trim() ?? '' },
    });
  }

  /** 自分の報告だけ(要望: ユーザー間で共有しない) */
  private async own(id: string, userId: string) {
    const r = await this.prisma.closeReport.findFirst({ where: { id, userId, deletedAt: null } });
    if (!r) throw new NotFoundException('報告が見つかりません');
    return r;
  }

  async update(id: string, userId: string, dto: SaveReportDto) {
    await this.own(id, userId);
    return this.prisma.closeReport.update({
      where: { id },
      data: { values: dto.values as Prisma.InputJsonValue, text: dto.text, storeName: dto.storeName?.trim() ?? '' },
    });
  }

  async remove(id: string, userId: string) {
    await this.own(id, userId);
    await this.prisma.closeReport.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}

/** 設定(項目・選択肢)。フォームを使う人とマスタ管理の両方が読むためタブ判定はしない */
@Controller('close-reports/config')
class CloseReportConfigController {
  constructor(private readonly service: CloseReportsService) {}

  @Get()
  get() {
    return this.service.config();
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Put()
  save(@Body() dto: SaveConfigDto) {
    return this.service.saveConfig(dto.value);
  }
}

@UseGuards(CloseReportTabGuard)
@Controller('close-reports')
class CloseReportsController {
  constructor(private readonly service: CloseReportsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }

  @Post()
  create(@Body() dto: SaveReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.id);
  }
}

// config のルート(close-reports/config)を :id より先に登録する
@Module({ providers: [CloseReportsService], controllers: [CloseReportConfigController, CloseReportsController] })
export class CloseReportsModule {}
