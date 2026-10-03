import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

class SaveSheetDto {
  @IsOptional() @IsIn(['CT', 'CH', '']) inputCode?: string;
  @IsOptional() @IsBoolean() hasJuryo?: boolean;
  @IsOptional() @IsBoolean() hasDoryoku?: boolean;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

@Injectable()
class ApplicationSheetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.applicationSheet.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 2000 });
    const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return rows.map((r) => ({ ...r, createdByName: nameOf(r.createdBy), updatedByName: nameOf(r.updatedBy) }));
  }

  create(dto: SaveSheetDto, userId: string) {
    if (!dto.hasJuryo && !dto.hasDoryoku) throw new BadRequestException('従量・動力のどちらか(または両方)を選んでください');
    return this.prisma.applicationSheet.create({
      data: {
        inputCode: dto.inputCode || null,
        hasJuryo: !!dto.hasJuryo,
        hasDoryoku: !!dto.hasDoryoku,
        data: (dto.data ?? {}) as Prisma.InputJsonValue,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async update(id: string, dto: SaveSheetDto, userId: string) {
    const existing = await this.prisma.applicationSheet.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('申込情報が見つかりません');
    const hasJuryo = dto.hasJuryo ?? existing.hasJuryo;
    const hasDoryoku = dto.hasDoryoku ?? existing.hasDoryoku;
    if (!hasJuryo && !hasDoryoku) throw new BadRequestException('従量・動力のどちらか(または両方)を選んでください');
    return this.prisma.applicationSheet.update({
      where: { id },
      data: {
        ...(dto.inputCode !== undefined ? { inputCode: dto.inputCode || null } : {}),
        hasJuryo,
        hasDoryoku,
        ...(dto.data ? { data: dto.data as Prisma.InputJsonValue } : {}),
        updatedBy: userId,
      },
    });
  }

  async remove(id: string) {
    await this.prisma.applicationSheet.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}

/** 権限デコレータ無し = ログインユーザーなら利用可(表示はタブ表示設定で制御) */
@Controller('application-sheets')
class ApplicationSheetsController {
  constructor(private readonly service: ApplicationSheetsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: SaveSheetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveSheetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

/**
 * 郵便番号→住所(要望: 郵便番号から住所自動表示)。無料の郵便番号検索API(zipcloud)をサーバー経由で引く
 * (ブラウザから外部へ直接通信しない=CSPのまま使える)。結果は再起動までメモリにキャッシュ。
 */
const zipCache = new Map<string, { address: string | null }>();

@Controller('zip')
class ZipController {
  @Get(':zip')
  async lookup(@Param('zip') raw: string) {
    const zip = raw.replace(/[^0-9]/g, '');
    if (zip.length !== 7) throw new BadRequestException('郵便番号は7桁で入力してください');
    const cached = zipCache.get(zip);
    if (cached) return cached;
    try {
      const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zip}`, { signal: AbortSignal.timeout(5000) });
      const json = (await res.json()) as { results?: { address1: string; address2: string; address3: string }[] | null };
      const r = json.results?.[0];
      const result = { address: r ? `${r.address1}${r.address2}${r.address3}` : null };
      zipCache.set(zip, result);
      return result;
    } catch {
      return { address: null, error: '住所を取得できませんでした' };
    }
  }
}

@Module({
  providers: [ApplicationSheetsService],
  controllers: [ApplicationSheetsController, ZipController],
})
export class ApplicationSheetsModule {}
