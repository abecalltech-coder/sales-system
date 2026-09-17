import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CustomReportsService } from './custom-reports.service';
import { CreateCustomReportDto, PreviewReportDto, UpdateCustomReportDto } from './dto/custom-report.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

/** サマリータブ「カスタムレポート作成」。既存の月次サマリー/シフトと同様、toss_case:viewで統一ゲートする。 */
@Controller('custom-reports')
export class CustomReportsController {
  constructor(private readonly service: CustomReportsService) {}

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post('preview')
  preview(@Body() dto: PreviewReportDto) {
    return this.service.preview(dto.config);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Post()
  create(@Body() dto: CreateCustomReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomReportDto) {
    return this.service.update(id, dto);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
