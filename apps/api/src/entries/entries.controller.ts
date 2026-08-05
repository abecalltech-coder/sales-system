import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { EntriesService } from './entries.service';
import { CreateEntryDto, UpdateEntryDto } from './dto/entry.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { streamCsvExport } from '../common/utils/csv-export.util';

@Controller('entries')
export class EntriesController {
  constructor(
    private readonly entriesService: EntriesService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions({ resource: 'entry', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.entriesService.list(query);
  }

  @RequirePermissions({ resource: 'entry', action: 'export' })
  @Get('export')
  async export(@Res() res: Response, @Query('statusId') statusId?: string) {
    await streamCsvExport({
      res,
      filenamePrefix: 'entries',
      columns: ['caseNumber', 'entryAt', 'statusId', 'applicationNumber', 'deficiencyNote'],
      getId: (row) => row.id,
      fetchBatch: (cursor, batchSize) =>
        this.prisma.entry.findMany({
          where: { deletedAt: null, ...(statusId ? { statusId } : {}) },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        }),
      mapRow: (row) => ({
        caseNumber: row.caseNumber,
        entryAt: row.entryAt?.toISOString() ?? '',
        statusId: row.statusId,
        applicationNumber: row.applicationNumber ?? '',
        deficiencyNote: row.deficiencyNote ?? '',
      }),
    });
  }

  @RequirePermissions({ resource: 'entry', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entriesService.findOne(id);
  }

  @RequirePermissions({ resource: 'entry', action: 'create' })
  @Post()
  create(@Body() dto: CreateEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entriesService.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'entry', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entriesService.update(id, dto, user.id);
  }
}
