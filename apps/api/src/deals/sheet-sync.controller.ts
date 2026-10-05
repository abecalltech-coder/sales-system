import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { DealSheetSyncService } from './sheet-sync.service';

class SaveSheetSyncDto {
  @IsString() @MaxLength(1000) url!: string;
  @IsObject() mapping!: Record<string, string>;
}

class SheetHeadersDto {
  @IsOptional() @IsString() @MaxLength(1000) url?: string;
}

/** 案件管理の「シートから更新」(要望)。/deals/:id と衝突しないよう別のパスにする */
@Controller('deal-sheet-sync')
export class DealSheetSyncController {
  constructor(private readonly sync: DealSheetSyncService) {}

  @Get()
  get() {
    return this.sync.getConfig();
  }

  @RequirePermissions({ resource: 'deal', action: 'create' })
  @Put()
  save(@Body() dto: SaveSheetSyncDto) {
    const mapping = Object.fromEntries(Object.entries(dto.mapping).filter(([h, k]) => h.trim() && typeof k === 'string' && k));
    return this.sync.saveConfig({ url: dto.url, mapping });
  }

  @RequirePermissions({ resource: 'deal', action: 'create' })
  @Post('headers')
  headers(@Body() dto: SheetHeadersDto) {
    return this.sync.headers(dto.url ?? '');
  }

  @RequirePermissions({ resource: 'deal', action: 'create' })
  @Post('run')
  run(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.run(user.id, user.name);
  }
}
