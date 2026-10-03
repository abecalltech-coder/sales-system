import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { StatusMasterService } from './status-master.service';
import { CreateStatusMasterDto, SetShareDto, UpdateStatusMasterDto } from './dto/status-master.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('status-master')
export class StatusMasterController {
  constructor(private readonly service: StatusMasterService) {}

  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get()
  list(@Query('category') category?: string) {
    return this.service.list(category);
  }

  /** 共通をオフにしている項目(一覧画面でアポ用の選択肢を使うかの判定に使う) */
  @RequirePermissions({ resource: 'master', action: 'view' })
  @Get('share')
  async share() {
    return { off: await this.service.shareOff() };
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Put('share/:category')
  setShare(@Param('category') category: string, @Body() dto: SetShareDto) {
    return this.service.setShared(category, dto.shared);
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
