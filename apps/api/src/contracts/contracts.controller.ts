import { Body, Controller, Get, Param, Patch, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ContractsService } from './contracts.service';
import { UpdateContractDto } from './dto/contract.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { streamCsvExport } from '../common/utils/csv-export.util';

@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions({ resource: 'contract', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.contractsService.list(query);
  }

  @RequirePermissions({ resource: 'contract', action: 'export' })
  @Get('export')
  async export(@Res() res: Response, @Query('statusId') statusId?: string) {
    await streamCsvExport(
      (cursor, batchSize) =>
        this.prisma.contract.findMany({
          where: { deletedAt: null, ...(statusId ? { matchingStatusId: statusId } : {}) },
          take: batchSize,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        }),
      {
        res,
        filenamePrefix: 'contracts',
        columns: ['caseNumber', 'contractedAt', 'contractAmount', 'matchingStatusId', 'matchingAt', 'switchingAt'],
        getId: (row) => row.id,
        mapRow: (row) => ({
          caseNumber: row.caseNumber,
          contractedAt: row.contractedAt?.toISOString() ?? '',
          contractAmount: row.contractAmount?.toString() ?? '',
          matchingStatusId: row.matchingStatusId,
          matchingAt: row.matchingAt?.toISOString() ?? '',
          switchingAt: row.switchingAt?.toISOString() ?? '',
        }),
      },
    );
  }

  @RequirePermissions({ resource: 'contract', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @RequirePermissions({ resource: 'contract', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contractsService.update(id, dto, user.id);
  }
}
