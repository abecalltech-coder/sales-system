import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

class SaveSheetDto {
  @IsOptional() @IsIn(['CT', 'CH', '']) inputCode?: string;
  @IsOptional() @IsBoolean() hasJuryo?: boolean;
  @IsOptional() @IsBoolean() hasDoryoku?: boolean;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}

class AddPhotoDto {
  @IsIn(['juryo', 'doryoku']) section!: string;
  @IsString() @MaxLength(4_000_000) image!: string;
  @IsString() @MaxLength(300_000) thumb!: string;
}

@Injectable()
class ApplicationSheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** 申込情報は全員で共有するため、変更を全員の画面へ知らせる(内容はAPIで取り直す) */
  private changed(id: string) {
    this.realtime.emitToAll('application-sheets.updated', { id });
  }

  async list() {
    const rows = await this.prisma.applicationSheet.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: { _count: { select: { photos: true } } },
    });
    const userIds = [...new Set(rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((x): x is string => !!x))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
    return rows.map(({ _count, ...r }) => ({ ...r, photoCount: _count.photos, createdByName: nameOf(r.createdBy), updatedByName: nameOf(r.updatedBy) }));
  }

  async create(dto: SaveSheetDto, userId: string) {
    if (!dto.hasJuryo && !dto.hasDoryoku) throw new BadRequestException('従量・動力のどちらか(または両方)を選んでください');
    const row = await this.prisma.applicationSheet.create({
      data: {
        inputCode: dto.inputCode || null,
        hasJuryo: !!dto.hasJuryo,
        hasDoryoku: !!dto.hasDoryoku,
        data: (dto.data ?? {}) as Prisma.InputJsonValue,
        createdBy: userId,
        updatedBy: userId,
      },
    });
    this.changed(row.id);
    return row;
  }

  async update(id: string, dto: SaveSheetDto, userId: string) {
    const existing = await this.prisma.applicationSheet.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('申込情報が見つかりません');
    const hasJuryo = dto.hasJuryo ?? existing.hasJuryo;
    const hasDoryoku = dto.hasDoryoku ?? existing.hasDoryoku;
    if (!hasJuryo && !hasDoryoku) throw new BadRequestException('従量・動力のどちらか(または両方)を選んでください');
    const row = await this.prisma.applicationSheet.update({
      where: { id },
      data: {
        ...(dto.inputCode !== undefined ? { inputCode: dto.inputCode || null } : {}),
        hasJuryo,
        hasDoryoku,
        ...(dto.data ? { data: dto.data as Prisma.InputJsonValue } : {}),
        updatedBy: userId,
      },
    });
    this.changed(id);
    return row;
  }

  /** 写真の一覧(小さい画像のみ。元の大きさは photo() で個別に取る) */
  photos(sheetId: string) {
    return this.prisma.applicationSheetPhoto.findMany({
      where: { sheetId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, section: true, thumb: true, createdAt: true, createdBy: true },
    });
  }

  async photo(photoId: string) {
    const p = await this.prisma.applicationSheetPhoto.findUnique({ where: { id: photoId }, select: { id: true, image: true } });
    if (!p) throw new NotFoundException('写真が見つかりません');
    return p;
  }

  async addPhoto(sheetId: string, dto: AddPhotoDto, userId: string) {
    const sheet = await this.prisma.applicationSheet.findFirst({ where: { id: sheetId, deletedAt: null } });
    if (!sheet) throw new NotFoundException('申込情報が見つかりません');
    if (!dto.image.startsWith('data:image/') || !dto.thumb.startsWith('data:image/')) throw new BadRequestException('画像の形式が正しくありません');
    const p = await this.prisma.applicationSheetPhoto.create({
      data: { sheetId, section: dto.section, image: dto.image, thumb: dto.thumb, createdBy: userId },
      select: { id: true, section: true, thumb: true, createdAt: true },
    });
    await this.prisma.applicationSheet.update({ where: { id: sheetId }, data: { updatedBy: userId } });
    this.changed(sheetId);
    return p;
  }

  async removePhoto(photoId: string) {
    const p = await this.prisma.applicationSheetPhoto.delete({ where: { id: photoId } });
    this.changed(p.sheetId);
    return { ok: true };
  }

  async remove(id: string) {
    await this.prisma.applicationSheet.update({ where: { id }, data: { deletedAt: new Date() } });
    this.changed(id);
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

  @Get(':id/photos')
  photos(@Param('id') id: string) {
    return this.service.photos(id);
  }

  @Post(':id/photos')
  addPhoto(@Param('id') id: string, @Body() dto: AddPhotoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addPhoto(id, dto, user.id);
  }

  @Get('photos/:photoId')
  photo(@Param('photoId') photoId: string) {
    return this.service.photo(photoId);
  }

  @Delete('photos/:photoId')
  removePhoto(@Param('photoId') photoId: string) {
    return this.service.removePhoto(photoId);
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
