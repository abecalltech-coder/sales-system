import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

const OWNER_TYPES = ['MEMO', 'WORK_RULE'] as const;
type OwnerType = (typeof OWNER_TYPES)[number];
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
/** 1つのメモ・ルールに貼れる枚数 */
const MAX_PER_OWNER = 30;

class AddImageDto {
  @IsIn(OWNER_TYPES) ownerType!: OwnerType;
  @IsString() ownerId!: string;
  // 画面で長辺1800px程度に縮めた JPEG の data URL
  @IsString() @MaxLength(4_000_000) image!: string;
}

/**
 * メモ・稼働ルールに貼る画像(要望: 画像も入れられて、そのまま見えるように)。
 * メモは本人だけ。稼働ルールは閲覧は全員、追加・削除は稼働ルールを編集できる人(管理者は常に可)。
 * 表示は <img src="/api/note-images/:id"> で画像そのものを返す(一覧に大きなデータを載せないため)。
 */
@Injectable()
class NoteImagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  private async canEditWorkRules(user: AuthenticatedUser) {
    if (user.roles.some((r) => ADMIN_ROLES.includes(r))) return true;
    return (await this.prisma.role.count({ where: { code: { in: user.roles }, canEditWorkRules: true } })) > 0;
  }

  /** 見られるか(edit=true なら追加・削除できるか) */
  private async assertAccess(ownerType: string, ownerId: string, user: AuthenticatedUser, edit: boolean) {
    if (ownerType === 'MEMO') {
      const memo = await this.prisma.memo.findFirst({ where: { id: ownerId, deletedAt: null }, select: { userId: true } });
      if (!memo) throw new NotFoundException('メモが見つかりません');
      if (memo.userId !== user.id) throw new ForbiddenException('自分のメモだけ見られます');
      return;
    }
    if (ownerType === 'WORK_RULE') {
      const rule = await this.prisma.workRule.findFirst({ where: { id: ownerId, deletedAt: null }, select: { id: true } });
      if (!rule) throw new NotFoundException('ルールが見つかりません');
      if (edit && !(await this.canEditWorkRules(user))) throw new ForbiddenException('稼働ルールを編集する権限がありません');
      return;
    }
    throw new BadRequestException('画像の貼り先が正しくありません');
  }

  private changed(ownerType: string, user: AuthenticatedUser) {
    // 稼働ルールは全員で見るので開いている画面にも反映する(メモは本人だけ)
    if (ownerType === 'WORK_RULE') this.realtime.emitToAll('work-rules.updated', {});
    else this.realtime.emitToUser(user.id, 'memos.updated', {});
  }

  async add(dto: AddImageDto, user: AuthenticatedUser) {
    await this.assertAccess(dto.ownerType, dto.ownerId, user, true);
    if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(dto.image)) throw new BadRequestException('画像の形式が正しくありません');
    const count = await this.prisma.noteImage.count({ where: { ownerType: dto.ownerType, ownerId: dto.ownerId } });
    if (count >= MAX_PER_OWNER) throw new BadRequestException(`画像は1つにつき${MAX_PER_OWNER}枚までです`);
    const created = await this.prisma.noteImage.create({
      data: { ownerType: dto.ownerType, ownerId: dto.ownerId, image: dto.image, order: count, createdBy: user.id },
      select: { id: true, ownerType: true, ownerId: true, order: true, createdAt: true },
    });
    this.changed(dto.ownerType, user);
    return created;
  }

  async raw(id: string, user: AuthenticatedUser) {
    const img = await this.prisma.noteImage.findUnique({ where: { id } });
    if (!img) throw new NotFoundException('画像が見つかりません');
    await this.assertAccess(img.ownerType, img.ownerId, user, false);
    const m = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(img.image);
    if (!m) throw new NotFoundException('画像が見つかりません');
    return { type: m[1], data: Buffer.from(m[2], 'base64') };
  }

  async remove(id: string, user: AuthenticatedUser) {
    const img = await this.prisma.noteImage.findUnique({ where: { id }, select: { id: true, ownerType: true, ownerId: true } });
    if (!img) throw new NotFoundException('画像が見つかりません');
    await this.assertAccess(img.ownerType, img.ownerId, user, true);
    await this.prisma.noteImage.delete({ where: { id } });
    this.changed(img.ownerType, user);
    return { ok: true };
  }
}

@Controller('note-images')
class NoteImagesController {
  constructor(private readonly service: NoteImagesService) {}

  @Post()
  add(@Body() dto: AddImageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.add(dto, user);
  }

  /** 画像そのもの(<img> で表示する)。内容は変わらないので端末に長く残してよい */
  @Get(':id')
  async raw(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { type, data } = await this.service.raw(id, user);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(data);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user);
  }
}

@Module({ providers: [NoteImagesService], controllers: [NoteImagesController] })
export class NoteImagesModule {}
