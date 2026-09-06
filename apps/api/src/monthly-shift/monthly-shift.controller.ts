import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { MonthlyShiftService } from './monthly-shift.service';
import { AddShiftRowDto, GetMonthlyShiftQueryDto, ShiftRowIdsDto, UpdateShiftRowDto } from './dto/monthly-shift.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

/** 月次シフト表。閲覧・編集とも「認証ユーザーなら可」で開始(サマリー実績表と同方針)。 */
@Controller('monthly-shift')
export class MonthlyShiftController {
  constructor(private readonly service: MonthlyShiftService) {}

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get()
  get(@Query() query: GetMonthlyShiftQueryDto) {
    return this.service.get(query.period);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('rows')
  addRow(@Body() dto: AddShiftRowDto) {
    return this.service.addRow(dto.period, dto.userId);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Patch('rows/:id')
  updateRow(@Param('id') id: string, @Body() dto: UpdateShiftRowDto) {
    return this.service.updateRow(id, dto);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('rows/reorder')
  reorder(@Body() dto: ShiftRowIdsDto) {
    return this.service.reorder(dto.ids);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('rows/bulk-delete')
  bulkDelete(@Body() dto: ShiftRowIdsDto) {
    return this.service.bulkDelete(dto.ids);
  }
}
