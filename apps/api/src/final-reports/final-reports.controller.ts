import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { FinalReportsService } from './final-reports.service';
import { CreateFieldDto, GetEntriesQueryDto, UpdateFieldDto, UpsertEntryDto } from './dto/final-report.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

const OVERSIGHT_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

@Controller('final-reports')
export class FinalReportsController {
  constructor(private readonly service: FinalReportsService) {}

  /** 入力画面用の項目一覧(有効なもののみ)。認証ユーザーなら可。 */
  @Get('fields')
  fields() {
    return this.service.listFields(false);
  }

  /** 自分(または責任者/管理者は指定ユーザー)の当月分 */
  @Get('entries')
  entries(@Query() query: GetEntriesQueryDto, @CurrentUser() user: AuthenticatedUser) {
    const targetId = this.resolveTarget(query.userId, user);
    return this.service.getMonth(targetId, query.period);
  }

  /** セル入力(自分。責任者/管理者は他ユーザー分も可) */
  @Post('entries')
  upsert(@Body() dto: UpsertEntryDto, @CurrentUser() user: AuthenticatedUser) {
    const targetId = this.resolveTarget(dto.userId, user);
    return this.service.upsertEntry(targetId, dto.date, dto.valuesPatch);
  }

  private resolveTarget(requested: string | undefined, user: AuthenticatedUser): string {
    if (!requested || requested === user.id) return user.id;
    if (user.roles.some((r) => OVERSIGHT_ROLES.includes(r))) return requested;
    return user.id;
  }

  // ---- 管理: 項目編集 ----------------------------------------------
  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('admin/fields')
  adminFields() {
    return this.service.listFields(true);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('admin/fields')
  createField(@Body() dto: CreateFieldDto) {
    return this.service.createField(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('admin/fields/:id')
  updateField(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.service.updateField(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete('admin/fields/:id')
  deleteField(@Param('id') id: string) {
    return this.service.deleteField(id);
  }
}
