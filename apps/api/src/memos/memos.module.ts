import { Body, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

class SaveMemoDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(100_000) body?: string;
  @IsOptional() @IsBoolean() pinned?: boolean;
}

/** メモ(要望: 題名ごとにいろいろな内容を残せる)。自分のメモだけ見られる */
@Injectable()
class MemosService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.memo.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  create(userId: string, dto: SaveMemoDto) {
    return this.prisma.memo.create({ data: { userId, title: dto.title?.trim() || '無題のメモ', body: dto.body ?? '', pinned: dto.pinned ?? false } });
  }

  private async own(id: string, userId: string) {
    const m = await this.prisma.memo.findFirst({ where: { id, deletedAt: null } });
    if (!m) throw new NotFoundException('メモが見つかりません');
    if (m.userId !== userId) throw new ForbiddenException('自分のメモだけ編集できます');
    return m;
  }

  async update(id: string, userId: string, dto: SaveMemoDto) {
    await this.own(id, userId);
    return this.prisma.memo.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || '無題のメモ' } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.own(id, userId);
    await this.prisma.memo.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }
}

@Controller('memos')
class MemosController {
  constructor(private readonly memos: MemosService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.memos.list(user.id);
  }

  @Post()
  create(@Body() dto: SaveMemoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.memos.create(user.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: SaveMemoDto, @CurrentUser() user: AuthenticatedUser) {
    return this.memos.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.memos.remove(id, user.id);
  }
}

@Module({ providers: [MemosService], controllers: [MemosController] })
export class MemosModule {}
