import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { ReorderDto, BulkIdsDto } from '../common/dto/reorder.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { streamCsvExport } from '../common/utils/csv-export.util';
import { extractPrefecture } from '../common/utils/prefecture.util';

const CSV_COLUMNS = [
  'apoDate',
  'meetingStartDate',
  'meetingStartTime',
  'apStaffName',
  'preConfirmStatusId',
  'preContactStatusId',
  'closerStatusId',
  'hook',
  'department',
  'corporateName',
  'memo',
  'industry',
  'importantMattersOkAt',
  'electronicContractAt',
  'nextActionAt',
  'contactName',
  'phone',
  'prefecture',
  'address',
  'hpProgressStatusId',
  'typeStatusId',
  'progressStatusId',
  'listName',
  'acquisitionMethodStatusId',
  'proposalLocation',
  'existingContract',
  'anshinBizProposed',
  'anshinBizStatusId',
  'anshinBizLostReasonStatusId',
  'anshinBizPoints',
  'mobileProposed',
  'mobileStatusId',
  'mobileLostReasonStatusId',
  'funfoProposed',
  'funfoStatusId',
  'funfoLostReasonStatusId',
  'deductionNote',
  'consentFormTypeStatusId',
  'acquiredCompanyName',
  'deliveryMethodStatusId',
  'deliveryStatusStatusId',
  'deliveredAt',
  'email',
  'specialNotes',
] as const;

const APPOINTMENT_STATUS_CATEGORIES = [
  'TOSS_PRE_CONFIRM',
  'APPOINTMENT_PRE_CONTACT',
  'APPOINTMENT_CLOSER',
  'APPOINTMENT_HP_PROGRESS',
  'APPOINTMENT_TYPE',
  'APPOINTMENT_PROGRESS',
  'APPOINTMENT_ACQUISITION_METHOD',
  'APPOINTMENT_ANSHIN_BIZ_STATUS',
  'APPOINTMENT_ANSHIN_BIZ_LOST_REASON',
  'APPOINTMENT_MOBILE_STATUS',
  'APPOINTMENT_MOBILE_LOST_REASON',
  'APPOINTMENT_FUNFO_STATUS',
  'APPOINTMENT_FUNFO_LOST_REASON',
  'APPOINTMENT_CONSENT_FORM_TYPE',
  'APPOINTMENT_DELIVERY_METHOD',
  'APPOINTMENT_DELIVERY_STATUS',
];

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

  @RequirePermissions({ resource: 'appointment', action: 'create' })
  @Post()
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'appointment', action: 'export' })
  @Get('export')
  async export(@Res() res: Response, @Query('statusId') statusId?: string) {
    const statusMasters = await this.prisma.statusMaster.findMany({
      where: { category: { in: APPOINTMENT_STATUS_CATEGORIES } },
    });
    const statusLabel = (id: string | null) => (id ? statusMasters.find((s) => s.id === id)?.displayName ?? id : '');

    await streamCsvExport(
      (cursor, batchSize) =>
        this.prisma.appointment.findMany({
          where: { deletedAt: null, ...(statusId ? { meetingStatusId: statusId } : {}) },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
          include: { customer: true },
        }),
      {
        res,
        filenamePrefix: 'appointments',
        columns: [...CSV_COLUMNS],
        getId: (row) => row.id,
        mapRow: (row) => ({
          apoDate: row.createdAt.toISOString().slice(0, 10),
          meetingStartDate: row.meetingStartAt?.toISOString().slice(0, 10) ?? '',
          meetingStartTime: row.meetingStartAt ? row.meetingStartAt.toISOString().slice(11, 16) : '',
          apStaffName: row.apStaffName ?? '',
          preConfirmStatusId: statusLabel(row.preConfirmStatusId),
          preContactStatusId: statusLabel(row.preContactStatusId),
          closerStatusId: statusLabel(row.closerStatusId),
          hook: row.hook ?? '',
          department: row.department ?? '',
          corporateName: row.customer?.corporateName ?? '',
          memo: row.memo ?? '',
          industry: row.industry ?? '',
          importantMattersOkAt: row.importantMattersOkAt?.toISOString().slice(0, 10) ?? '',
          electronicContractAt: row.electronicContractAt?.toISOString().slice(0, 10) ?? '',
          nextActionAt: row.nextActionAt?.toISOString().slice(0, 10) ?? '',
          contactName: row.customer?.contactName ?? '',
          phone: row.customer?.phone ?? '',
          prefecture: extractPrefecture(row.customer?.address) ?? '',
          address: row.customer?.address ?? '',
          hpProgressStatusId: statusLabel(row.hpProgressStatusId),
          typeStatusId: statusLabel(row.typeStatusId),
          progressStatusId: statusLabel(row.progressStatusId),
          listName: row.listName ?? '',
          acquisitionMethodStatusId: statusLabel(row.acquisitionMethodStatusId),
          proposalLocation: row.proposalLocation ?? '',
          existingContract: row.existingContract ?? '',
          anshinBizProposed: row.anshinBizProposed ? '1' : '0',
          anshinBizStatusId: statusLabel(row.anshinBizStatusId),
          anshinBizLostReasonStatusId: statusLabel(row.anshinBizLostReasonStatusId),
          anshinBizPoints: row.anshinBizPoints ?? '',
          mobileProposed: row.mobileProposed ? '1' : '0',
          mobileStatusId: statusLabel(row.mobileStatusId),
          mobileLostReasonStatusId: statusLabel(row.mobileLostReasonStatusId),
          funfoProposed: row.funfoProposed ? '1' : '0',
          funfoStatusId: statusLabel(row.funfoStatusId),
          funfoLostReasonStatusId: statusLabel(row.funfoLostReasonStatusId),
          deductionNote: row.deductionNote ?? '',
          consentFormTypeStatusId: statusLabel(row.consentFormTypeStatusId),
          acquiredCompanyName: row.acquiredCompanyName ?? '',
          deliveryMethodStatusId: statusLabel(row.deliveryMethodStatusId),
          deliveryStatusStatusId: statusLabel(row.deliveryStatusStatusId),
          deliveredAt: row.deliveredAt?.toISOString().slice(0, 10) ?? '',
          email: row.customer?.email ?? '',
          specialNotes: row.specialNotes ?? '',
        }),
      },
    );
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

  @RequirePermissions({ resource: 'appointment', action: 'edit' })
  @Post('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.appointmentsService.reorder(dto.ids);
  }

  @RequirePermissions({ resource: 'appointment', action: 'delete' })
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkIdsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.bulkDelete(dto.ids, user.id);
  }
}
