import { Body, Controller, Get, Injectable, Module, Post, Query, Req } from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuditTrailInterceptor } from './audit-trail.interceptor';

/** 画面上でのコピー(要望: 誰が・いつ・どのタブで・何をコピーしたかを操作ログに残す) */
class CopyLogDto {
  /** コピーした画面のパス */
  @IsString() @MaxLength(200) page!: string;
  /** どこからコピーしたか(例: 一覧のセル、チャット、選択した文字) */
  @IsString() @MaxLength(100) source!: string;
  /** コピーした内容(長い場合は先頭だけ) */
  @IsString() @MaxLength(3000) text!: string;
  /** コピーしたセル数・文字数など */
  @IsOptional() @IsInt() @Min(0) cells?: number;
  @IsOptional() @IsString() @MaxLength(200) target?: string;
}

const COPY_PREVIEW_MAX = 1000;

@Injectable()
class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async logCopy(userId: string, dto: CopyLogDto, ip?: string) {
    const text = dto.text.length > COPY_PREVIEW_MAX ? `${dto.text.slice(0, COPY_PREVIEW_MAX)}…(以下省略、全${dto.text.length}文字)` : dto.text;
    await this.prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'copy',
        targetType: 'copy',
        ipAddress: ip,
        after: {
          page: dto.page,
          op: dto.source === 'CSV出力' ? 'CSV出力' : 'コピー',
          target: dto.target ?? null,
          changes: [{ label: dto.source, after: text }],
          ...(dto.cells ? { count: dto.cells } : {}),
        },
        success: true,
      },
    });
    return { ok: true };
  }

  async list(params: { page: number; pageSize: number; action?: string; actorUserId?: string; kind?: string }) {
    // コピー・CSV出力(情報の持ち出しにつながる操作)だけ/それ以外だけ の絞り込み(要望)
    const copyLike = { OR: [{ action: 'copy' }, { action: { endsWith: '.export' } }] };
    const where = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.actorUserId ? { actorUserId: params.actorUserId } : {}),
      ...(params.kind === 'copy' ? copyLike : params.kind === 'other' ? { NOT: copyLike } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        orderBy: { createdAt: 'desc' },
        // 変更前スナップショット(before)は件数が多いと重いため一覧では返さない。表示に必要なのは after の整形済み情報のみ
        select: {
          id: true,
          action: true,
          targetType: true,
          after: true,
          success: true,
          errorMessage: true,
          createdAt: true,
          actor: { select: { name: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }
}

@Controller('audit-logs')
class AuditLogsController {
  constructor(private readonly service: AuditLogsService) {}

  /** コピーの記録。ログインユーザーなら誰でも(自分の操作として)送れる */
  @Post('copy')
  copy(@Body() dto: CopyLogDto, @CurrentUser() user: AuthenticatedUser, @Req() req: { ip?: string }) {
    return this.service.logCopy(user.id, dto, req.ip);
  }

  @RequirePermissions({ resource: 'system', action: 'view' })
  @Get()
  list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
    @Query('action') action?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('kind') kind?: string,
  ) {
    return this.service.list({ page: Number(page), pageSize: Math.min(Number(pageSize), 2000), action, actorUserId, kind });
  }
}

@Module({
  // 全タブの更新操作を操作ログへ記録する(要望: どのタブで何を何に変えたか)
  providers: [AuditLogsService, { provide: APP_INTERCEPTOR, useClass: AuditTrailInterceptor }],
  controllers: [AuditLogsController],
})
export class AuditLogsModule {}
