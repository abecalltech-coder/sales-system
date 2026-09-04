import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { TossCasesService } from './toss-cases.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTossCaseDto, UpdateTossCaseDto, BulkUpdateTossCaseDto, SetCallingFlagDto } from './dto/toss-case.dto';
import { ReorderDto } from '../common/dto/reorder.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { streamCsvExport } from '../common/utils/csv-export.util';
import { extractPrefecture } from '../common/utils/prefecture.util';

const CSV_COLUMNS = [
  'caseNumber',
  'receivedAt',
  'nextActionAt',
  'apStaffName',
  'preConfirmStatusId',
  'department',
  'corporateName',
  'memo',
  'contactName',
  'phone',
  'prefecture',
  'address',
  'proposal',
  'progressStatusId',
  'ngReasonStatusId',
  'listName',
  'callDirection',
  'industry',
  'hook',
  'existingContract',
  'email',
  'statusId',
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
    const statusMasters = await this.prisma.statusMaster.findMany({
      where: { category: { in: ['TOSS', 'TOSS_PRE_CONFIRM', 'TOSS_PROGRESS', 'TOSS_NG_REASON'] } },
    });
    const statusLabel = (id: string | null) => (id ? statusMasters.find((s) => s.id === id)?.displayName ?? id : '');

    await streamCsvExport(
      (cursor, batchSize) =>
        this.prisma.tossCase.findMany({
          where: { deletedAt: null, ...(statusId ? { statusId } : {}) },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
          include: { customer: true },
        }),
      {
        res,
        filenamePrefix: 'toss-cases',
        columns: [...CSV_COLUMNS],
        getId: (row) => row.id,
        mapRow: (row) => ({
          caseNumber: row.caseNumber,
          receivedAt: row.receivedAt.toISOString(),
          nextActionAt: row.nextActionAt?.toISOString() ?? '',
          apStaffName: row.apStaffName ?? '',
          preConfirmStatusId: statusLabel(row.preConfirmStatusId),
          department: row.department ?? '',
          corporateName: row.customer?.corporateName ?? '',
          memo: row.memo ?? '',
          contactName: row.customer?.contactName ?? '',
          phone: row.customer?.phone ?? '',
          prefecture: extractPrefecture(row.customer?.address) ?? '',
          address: row.customer?.address ?? '',
          proposal: row.proposal ?? '',
          progressStatusId: statusLabel(row.progressStatusId),
          ngReasonStatusId: statusLabel(row.ngReasonStatusId),
          listName: row.listName ?? '',
          callDirection: row.callDirection ?? '',
          industry: row.industry ?? '',
          hook: row.hook ?? '',
          existingContract: row.existingContract ?? '',
          email: row.customer?.email ?? '',
          statusId: statusLabel(row.statusId),
        }),
      },
    );
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

  /** 対応中フラグ(架電中ボタン)の切替。全員へリアルタイム共有し、二重架電を防止する。 */
  @RequirePermissions({ resource: 'toss_case', action: 'edit' })
  @Patch(':id/calling-flag')
  setCallingFlag(@Param('id') id: string, @Body() dto: SetCallingFlagDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.setCallingFlag(id, dto.active, user.id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'edit' })
  @Post('bulk-update')
  bulkUpdate(@Body() dto: BulkUpdateTossCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.bulkUpdate(dto, user.id);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'edit' })
  @Post('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.tossCasesService.reorder(dto.ids);
  }

  @RequirePermissions({ resource: 'toss_case', action: 'delete' })
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tossCasesService.softDelete(id, user.id);
  }
}
