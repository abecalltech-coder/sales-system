import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateTeamDto,
  UpdateTeamDto,
} from './dto/organization.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('departments')
  listDepartments() {
    return this.organizationsService.listDepartments();
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.organizationsService.createDepartment(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('departments/:id')
  updateDepartment(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.organizationsService.updateDepartment(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('teams')
  createTeam(@Body() dto: CreateTeamDto) {
    return this.organizationsService.createTeam(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('teams/:id')
  updateTeam(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.organizationsService.updateTeam(id, dto);
  }
}
