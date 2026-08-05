import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { UpdateContractDto } from './dto/contract.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @RequirePermissions({ resource: 'contract', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.contractsService.list(query);
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
