import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApproveUserDto } from './dto/approve-user.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermissions({ resource: 'user', action: 'view' })
  @Get()
  list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('keyword') keyword?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.list({
      page: Number(page),
      pageSize: Math.min(Number(pageSize), 100),
      keyword,
      departmentId,
      status,
    });
  }

  @RequirePermissions({ resource: 'user', action: 'view' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @RequirePermissions({ resource: 'user', action: 'create' })
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @RequirePermissions({ resource: 'user', action: 'edit' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @RequirePermissions({ resource: 'user', action: 'edit' })
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string) {
    return this.usersService.resetPassword(id);
  }

  /** 管理者が対象ユーザーのパスワードを直接指定して設定する(要望) */
  @RequirePermissions({ resource: 'user', action: 'edit' })
  @Post(':id/set-password')
  setPassword(@Param('id') id: string, @Body() dto: SetPasswordDto) {
    return this.usersService.setPassword(id, dto);
  }

  /** 自己登録ユーザーの承認(セクション追加要望) */
  @RequirePermissions({ resource: 'user', action: 'edit' })
  @Post(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveUserDto) {
    return this.usersService.approve(id, dto);
  }

  /** 自己登録ユーザーの却下(セクション追加要望) */
  @RequirePermissions({ resource: 'user', action: 'edit' })
  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.usersService.reject(id);
  }

  @RequirePermissions({ resource: 'user', action: 'delete' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.softDelete(id);
  }
}
