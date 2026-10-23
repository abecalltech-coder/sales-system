import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsString } from 'class-validator';
import { TossFormService } from './toss-form.service';
import { CreateTossFormFieldDto, SubmitTossFormDto, UpdateTossFormFieldDto } from './dto/toss-form.dto';
import { AppointmentsService } from '../appointments/appointments.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

/** アポ登録のタブ(ユーザー管理の「役職ごとのタブ表示」で役職ごとに出し入れする) */
export const APO_FORM_TAB = '/appointments/new';

const isAdmin = (user: AuthenticatedUser) => user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN');

/**
 * アポ登録を使えるか。権限はユーザー管理の「役職ごとのタブ表示」で決める(要望: アポインターも登録でき、
 * ユーザー管理で変更できるように)。タブ制限なし(null)の役職と管理者は使える。
 */
function assertCanUse(user: AuthenticatedUser) {
  if (isAdmin(user) || !user.visibleTabs || user.visibleTabs.includes(APO_FORM_TAB)) return;
  throw new ForbiddenException('アポ登録を使う権限がありません(ユーザー管理の役職ごとのタブ表示で設定します)');
}

class UpdateApoMemoDto {
  @IsString() memo!: string;
}

/** アポ登録フォーム(アポ詳細を単品で作る)と、その項目設定(管理タブ「アポフォーム設定」) */
@Controller('apo-form')
export class ApoFormController {
  constructor(
    private readonly service: TossFormService,
    private readonly appointments: AppointmentsService,
  ) {}

  @Get('fields')
  fields(@CurrentUser() user: AuthenticatedUser, @Query('all') all?: string) {
    const canEditMaster = isAdmin(user) || user.permissions.some((p) => p.resource === 'master' && p.action === 'edit');
    if (!canEditMaster) assertCanUse(user);
    return this.service.listFields(all === '1' && canEditMaster, 'APPOINTMENT');
  }

  @Post('submit')
  submit(@Body() dto: SubmitTossFormDto, @CurrentUser() user: AuthenticatedUser) {
    assertCanUse(user);
    return this.service.submitAppointment(dto, user.id);
  }

  /** 登録したアポ詳細(管理者は全員分) */
  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    assertCanUse(user);
    return this.appointments.listFromApoForm(user.id, isAdmin(user));
  }

  /** 登録したアポ詳細の本文を直す */
  @Patch('mine/:id')
  updateMine(@Param('id') id: string, @Body() dto: UpdateApoMemoDto, @CurrentUser() user: AuthenticatedUser) {
    assertCanUse(user);
    return this.appointments.updateApoFormMemo(id, dto.memo, user.id, isAdmin(user));
  }

  // --- 管理(アポフォーム設定) ---
  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('fields')
  createField(@Body() dto: CreateTossFormFieldDto) {
    return this.service.createField(dto, 'APPOINTMENT');
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('fields/:id')
  updateField(@Param('id') id: string, @Body() dto: UpdateTossFormFieldDto) {
    return this.service.updateField(id, dto, 'APPOINTMENT');
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete('fields/:id')
  deleteField(@Param('id') id: string) {
    return this.service.deleteField(id, 'APPOINTMENT');
  }
}
