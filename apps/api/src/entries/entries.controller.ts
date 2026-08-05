import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { CreateEntryDto, UpdateEntryDto } from './dto/entry.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ListQueryDto } from '../common/dto/list-query.dto';

@Controller('entries')
export class EntriesController {
  constructor(private readonly entriesService: EntriesService) {}

  @RequirePermissions({ resource: 'entry', action: 'view' })
  @Get()
  list(@Query() query: ListQueryDto) {
    return this.entriesService.list(query);
  }

  @RequirePermissions({ resource: 'entry', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.entriesService.findOne(id);
  }

  @RequirePermissions({ resource: 'entry', action: 'create' })
  @Post()
  create(@Body() dto: CreateEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entriesService.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'entry', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEntryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entriesService.update(id, dto, user.id);
  }
}
