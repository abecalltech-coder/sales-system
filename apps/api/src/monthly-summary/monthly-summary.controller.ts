import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MonthlySummaryService } from './monthly-summary.service';
import {
  AddSummaryRowDto,
  GetMonthlySummaryQueryDto,
  SummaryRowIdsDto,
  UpdateSummaryRowDto,
} from './dto/monthly-summary.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

/**
 * 月次サマリー実績表。閲覧・編集とも現行の SummarySheet と同じく「認証ユーザーなら可」で開始する
 * (絞る場合は summary リソースを seed に追加し @RequirePermissions を付ける)。
 */
@Controller('monthly-summary')
export class MonthlySummaryController {
  constructor(private readonly service: MonthlySummaryService) {}

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('departments')
  departments() {
    return this.service.departments();
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get()
  get(@Query() query: GetMonthlySummaryQueryDto) {
    return this.service.get(query.period, query.departmentId);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('rows')
  addRow(@Body() dto: AddSummaryRowDto) {
    return this.service.addRow(dto.period, dto.departmentId, dto.userId, dto.role);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Patch('rows/:id')
  updateRow(@Param('id') id: string, @Body() dto: UpdateSummaryRowDto) {
    return this.service.updateRow(id, dto);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('rows/reorder')
  reorder(@Body() dto: SummaryRowIdsDto) {
    return this.service.reorder(dto.ids);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('rows/bulk-delete')
  bulkDelete(@Body() dto: SummaryRowIdsDto) {
    return this.service.bulkDelete(dto.ids);
  }
}
