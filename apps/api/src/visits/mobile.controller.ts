import { Body, Controller, Get, Post } from '@nestjs/common';
import { VisitsService } from '../visits/visits.service';
import { OfflineActionItemDto } from '../visits/dto/mobile-visit.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SyncOfflineActionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfflineActionItemDto)
  actions!: OfflineActionItemDto[];
}

@Controller('mobile')
export class MobileController {
  constructor(private readonly visitsService: VisitsService) {}

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get('home')
  home(@CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.mobileHome(user.id);
  }

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get('today-visits')
  todayVisits(@CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.todayVisits(user.id);
  }

  @RequirePermissions({ resource: 'visit', action: 'view' })
  @Get('upcoming-visits')
  upcomingVisits(@CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.upcomingVisits(user.id);
  }
}

@Controller('offline-actions')
export class OfflineActionsController {
  constructor(private readonly visitsService: VisitsService) {}

  @RequirePermissions({ resource: 'visit', action: 'edit' })
  @Post('sync')
  sync(@Body() dto: SyncOfflineActionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.visitsService.syncOfflineActions(dto.actions, user.id);
  }
}
