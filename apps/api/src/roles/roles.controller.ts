import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { RolesService } from './roles.service';
import { UpdateRoleDto } from './dto/role.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly service: RolesService) {}

  @RequirePermissions({ resource: 'user', action: 'view' })
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions({ resource: 'user', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.service.update(id, dto);
  }
}
