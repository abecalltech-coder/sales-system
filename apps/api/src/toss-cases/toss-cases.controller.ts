import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { stringify } from 'csv-stringify';
import { TossCasesService } from './toss-cases.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTossCaseDto, UpdateTossCaseDto, BulkUpdateTossCaseDto } from './dto/toss-case.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';

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
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="toss-cases-${Date.now()}.csv"`);

    const stringifier = stringify({ header: true, columns: CSV_COLUMNS as unknown as string[] });
    stringifier.pipe(res);

    const BATCH_SIZE = 1000;
    let cursor: string | undefined;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows = await this.prisma.tossCase.findMany({
        where: { deletedAt: null, ...(statusId ? { statusId } : {}) },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: { customer: true },
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        stringifier.write({
          caseNumber: row.caseNumber,
          receivedAt: row.receivedAt.toISOString(),
          corporateName: row.customer?.corporateName ?? '',
          contactName: row.customer?.contactName ?? '',
          phone: row.customer?.phone ?? '',
          email: row.customer?.email ?? '',
          statusId: row.statusId,
          memo: row.memo ?? '',
        });
      }
      cursor = rows[rows.length - 1].id;
      if (rows.length < BATCH_SIZE) break;
    }

    stringifier.end();
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
