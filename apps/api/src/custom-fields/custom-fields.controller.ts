import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  SetCustomFieldValueDto,
} from './dto/custom-field.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly service: CustomFieldsService) {}

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get()
  list(@Query('entityType') entityType?: string) {
    return this.service.list(entityType);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post()
  create(@Body() dto: CreateCustomFieldDto) {
    return this.service.create(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.service.update(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.softDelete(id);
  }

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('values/:entityType/:entityId')
  getValues(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.service.getValues(entityType, entityId);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('values')
  setValue(@Body() dto: SetCustomFieldValueDto) {
    return this.service.setValue(dto);
  }
}
