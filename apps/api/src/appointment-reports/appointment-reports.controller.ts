import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AppointmentReportsService } from './appointment-reports.service';
import { CreateAppointmentReportDto } from './dto/appointment-report.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

@Controller('appointment-reports')
export class AppointmentReportsController {
  constructor(private readonly service: AppointmentReportsService) {}

  @RequirePermissions({ resource: 'appointment', action: 'edit' })
  @Post()
  report(@Body() dto: CreateAppointmentReportDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.report(dto, user.id);
  }

  // 権限はサービス側でロール(MANAGER/ADMIN)に応じてスコープするため、
  // ここでは認証済みであること以外の追加チェックを行わない。
  @Get('pending')
  listPending(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPending(user);
  }

  @Post(':id/acknowledge')
  acknowledge(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.acknowledge(id, user.id);
  }
}
