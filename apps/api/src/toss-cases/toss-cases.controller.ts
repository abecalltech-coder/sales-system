import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { TossCasesService } from './toss-cases.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTossCaseDto, UpdateTossCaseDto, BulkUpdateTossCaseDto } from './dto/toss-case.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { streamCsvExport } from '../common/utils/csv-export.util';

const CSV_COLUMNS = [
  'caseNumber',
  'receivedAt',
  'corporateName',
  'contactName',
  'phone',
  'email',
  'statusId',
  'memo',
] as const;

@Controller('toss-cases')
export class TossCasesController {
  constructor(
    private readonly tossCasesService: TossCasesService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.tossCasesService.list(query);
  }

  /**
   * CSVストリーミング出力(セクション31: 一覧データを全件取得してはならない)。
   * カーソルベースのバッチ取得でメモリに全件を載せずレスポンスへ書き出す。
   */
  @RequirePermissions({ resource: 'toss_case', action: 'export' })
  @Get('export')
  async export(@Res() res: Response, @Query('statusId') statusId?: string) {
    await streamCsvExport({
      res,
      filenamePrefix: 'toss-cases',
      columns: [...CSV_COLUMNS],
      getId: (row) => row.id,
      fetchBatch: (cursor, batchSize) =>
        this.prisma.tossCase.findMany({
          where: { deletedAt: null, ...(statusId ? { statusId } : {}) },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
          include: { customer: true },
        }),
      mapRow: (row) => ({
        caseNumber: row.caseNumber,
        receivedAt: row.receivedAt.toISOString(),
        corporateName: row.customer?.corporateName ?? '',
        contactName: row.customer?.contactName ?? '',
        phone: row.customer?.phone ?? '',
        email: row.customer?.email ?? '',
        statusId: row.statusId,
        memo: row.memo ?? '',
      }),
    });
  }

  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tossCasesService.findOne(id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'create' })
  @Post()
  create(@Body() dto: CreateTossCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTossCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.update(id, dto, user.id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'edit' })
  @Post('bulk-update')
  bulkUpdate(@Body() dto: BulkUpdateTossCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.bulkUpdate(dto, user.id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'delete' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.softDelete(id, user.id);
  }
}
