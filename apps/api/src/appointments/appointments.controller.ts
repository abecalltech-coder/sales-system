import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppointmentsService } from './appointments.service';
import { UpdateAppointmentDto } from './dto/appointment.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { streamCsvExport } from '../common/utils/csv-export.util';

@Controller('appointments')
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions({ resource: 'appointment', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.appointmentsService.list(query);
  }

  @RequirePermissions({ resource: 'appointment', action: 'export' })
  @Get('export')
  async export(@Res() res: Response, @Query('statusId') statusId?: string) {
    await streamCsvExport({
      res,
      filenamePrefix: 'appointments',
      columns: ['caseNumber', 'meetingStartAt', 'meetingType', 'visitAddress', 'meetingStatusId', 'calendarSyncStatus'],
      getId: (row) => row.id,
      fetchBatch: (cursor, batchSize) =>
        this.prisma.appointment.findMany({
          where: { deletedAt: null, ...(statusId ? { meetingStatusId: statusId } : {}) },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        }),
      mapRow: (row) => ({
        caseNumber: row.caseNumber,
        meetingStartAt: row.meetingStartAt?.toISOString() ?? '',
        meetingType: row.meetingType,
        visitAddress: row.visitAddress ?? '',
        meetingStatusId: row.meetingStatusId,
        calendarSyncStatus: row.calendarSyncStatus,
      }),
    });
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
