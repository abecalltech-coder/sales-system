import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StatusMasterService } from './status-master.service';
import { CreateStatusMasterDto, UpdateStatusMasterDto } from './dto/status-master.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('status-master')
export class StatusMasterController {
  constructor(private readonly service: StatusMasterService) {}

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get()
  list(@Query('category') category?: string) {
    return this.service.list(category);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post()
  create(@Body() dto: CreateStatusMasterDto) {
    return this.service.create(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStatusMasterDto) {
    return this.service.update(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
