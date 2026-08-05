import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.visitsService.list(query);
  }

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.visitsService.findOne(id);
  }

  @RequirePermissions({ resource: 'visit', action: 'create' })
  @Post()
  create(@Body() dto: CreateVisitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'visit', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVisitDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.update(id, dto, user.id);
  }
}
