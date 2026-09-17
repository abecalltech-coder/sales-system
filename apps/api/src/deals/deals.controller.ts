import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DealsService } from './deals.service';
import {
  CreateDealDto,
  CreateDealFieldDto,
  CreateDealFieldOptionDto,
  ListDealsQueryDto,
  UpdateDealDto,
  UpdateDealFieldDto,
  UpdateDealFieldOptionDto,
} from './dto/deal.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { BulkIdsDto, ReorderDto } from '../common/dto/reorder.dto';

@Controller('deals')
export class DealsController {
  constructor(private readonly service: DealsService) {}

  // ---- 列(項目)。画面表示用は認証ユーザーなら閲覧可 -------------------
  @Get('fields')
  fields() {
    return this.service.listFields(false);
  }

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('fields/all')
  adminFields() {
    return this.service.listFields(true);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('fields')
  createField(@Body() dto: CreateDealFieldDto) {
    return this.service.createField(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('fields/:id')
  updateField(@Param('id') id: string, @Body() dto: UpdateDealFieldDto) {
    return this.service.updateField(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete('fields/:id')
  deleteField(@Param('id') id: string) {
    return this.service.deleteField(id);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('fields/reorder')
  reorderFields(@Body() dto: BulkIdsDto) {
    return this.service.reorderFields(dto.ids);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('fields/:id/options')
  createOption(@Param('id') id: string, @Body() dto: CreateDealFieldOptionDto) {
    return this.service.createOption(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('field-options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateDealFieldOptionDto) {
    return this.service.updateOption(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete('field-options/:id')
  deleteOption(@Param('id') id: string) {
    return this.service.deleteOption(id);
  }

  // ---- 案件(行) --------------------------------------------------------
  @RequirePermissions({ resource: 'deal', action: 'view' })
  @Get()
  list(@Query() query: ListDealsQueryDto) {
    return this.service.list({ page: query.page ?? 1, pageSize: query.pageSize ?? 100, keyword: query.keyword });
  }

  @RequirePermissions({ resource: 'deal', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @RequirePermissions({ resource: 'deal', action: 'create' })
  @Post()
  create(@Body() dto: CreateDealDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.id);
  }

  @RequirePermissions({ resource: 'deal', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDealDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.id);
  }

  @RequirePermissions({ resource: 'deal', action: 'edit' })
  @Post('reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.service.reorder(dto.ids);
  }

  @RequirePermissions({ resource: 'deal', action: 'delete' })
  @Post('bulk-delete')
  bulkDelete(@Body() dto: BulkIdsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.bulkDelete(dto.ids, user.id);
  }
}
