import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { UpdateAppointmentDto } from './dto/appointment.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @RequirePermissions({ resource: 'appointment', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.appointmentsService.list(query);
  }

  @RequirePermissions({ resource: 'appointment', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appointmentsService.findOne(id);
  }

  @RequirePermissions({ resource: 'appointment', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.update(id, dto, user.id);
  }

  @RequirePermissions({ resource: 'appointment', action: 'edit' })
  @Post(':id/retry-calendar')
  retryCalendar(@Param('id') id: string) {
    return this.appointmentsService.retryCalendarSync(id);
  }
}
