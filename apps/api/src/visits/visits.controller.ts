import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { VisitsService } from './visits.service';
import { CreateVisitDto, UpdateVisitDto } from './dto/visit.dto';
import { ArriveVisitDto, StartMeetingDto, EndMeetingDto } from './dto/mobile-visit.dto';
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

  @RequirePermissions({ resource: 'visit', action: 'edit' })
  @Post(':id/arrive')
  arrive(@Param('id') id: string, @Body() dto: ArriveVisitDto, @CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.visitsService.arrive(id, dto, user.id, req.ip);
  }

  @RequirePermissions({ resource: 'visit', action: 'edit' })
  @Post(':id/start-meeting')
  startMeeting(@Param('id') id: string, @Body() dto: StartMeetingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.startMeeting(id, dto, user.id);
  }

  @RequirePermissions({ resource: 'visit', action: 'edit' })
  @Post(':id/end-meeting')
  endMeeting(@Param('id') id: string, @Body() dto: EndMeetingDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.endMeeting(id, dto, user.id);
  }

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.visitsService.findOne(id).then((v) => v.statusHistory);
  }
}

