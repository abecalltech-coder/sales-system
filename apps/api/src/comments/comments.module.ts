import { Body, Controller, ForbiddenException, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { RealtimeService } from '../realtime/realtime.service';

const ENTITY_TYPES = ['TOSS_CASE', 'APPOINTMENT', 'VISIT', 'CONTRACT', 'ENTRY', 'CUSTOMER'] as const;

const ENTITY_TO_RESOURCE: Record<string, string> = {
  TOSS_CASE: 'toss_case',
  APPOINTMENT: 'appointment',
  VISIT: 'visit',
  CONTRACT: 'contract',
  ENTRY: 'entry',
  CUSTOMER: 'customer',
};

class CreateCommentDto {
  @IsIn(ENTITY_TYPES)
  entityType!: (typeof ENTITY_TYPES)[number];

  @IsUUID()
  entityId!: string;

  @IsString()
  @MinLength(1)
  body!: string;
}

@Injectable()
class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  list(entityType: string, entityId: string) {
    return this.prisma.caseComment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateCommentDto, userId: string) {
    const comment = await this.prisma.caseComment.create({
      data: { entityType: dto.entityType, entityId: dto.entityId, userId, body: dto.body },
    });

    // ルーム名は entityType の値をそのまま小文字roomキーへ変換する簡易マッピング
    const roomPrefix: Record<string, string> = {
      TOSS_CASE: 'toss',
      APPOINTMENT: 'appointment',
      VISIT: 'visit',
      CONTRACT: 'contract',
    };
    const room = roomPrefix[dto.entityType];
    if (room) {
      this.realtime.emitCaseUpdated([`${room}:${dto.entityId}`], {
        entityType: dto.entityType as never,
        id: dto.entityId,
        version: 0,
        updatedAt: comment.createdAt.toISOString(),
        updatedBy: userId,
        action: 'updated',
        changedFields: ['comment'],
      });
    }

    return comment;
  }
}

@Controller('comments')
class CommentsController {
  constructor(private readonly service: CommentsService) {}

  private assertPermission(user: AuthenticatedUser, entityType: string, action: 'view' | 'edit') {
    if (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN')) return;
    const resource = ENTITY_TO_RESOURCE[entityType];
    const ok = user.permissions.some((p) => p.resource === resource && p.action === action);
    if (!ok) {
      throw new ForbiddenException('この操作を行う権限がありません');
    }
  }

  @Get()
  list(@Query('entityType') entityType: string, @Query('entityId') entityId: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertPermission(user, entityType, 'view');
    return this.service.list(entityType, entityId);
  }

  @Post()
  create(@Body() dto: CreateCommentDto, @CurrentUser() user: AuthenticatedUser) {
    this.assertPermission(user, dto.entityType, 'edit');
    return this.service.create(dto, user.id);
  }
}

@Module({
  providers: [CommentsService],
  controllers: [CommentsController],
})
export class CommentsModule {}
