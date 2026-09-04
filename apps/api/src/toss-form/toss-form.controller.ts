import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TossFormService } from './toss-form.service';
import { CreateTossFormFieldDto, SubmitTossFormDto, UpdateTossFormFieldDto } from './dto/toss-form.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

@Controller('toss-form')
export class TossFormController {
  constructor(private readonly service: TossFormService) {}

  /** アポインターのトス登録フォーム用(有効な項目のみ) */
  @RequirePermissions({ resource: 'toss_case', action: 'view' })
  @Get('fields')
  fields(@Query('all') all?: string) {
    return this.service.listFields(all === '1');
  }

  /** アポインターがフォームから送信 → トス案件作成 */
  @RequirePermissions({ resource: 'toss_case', action: 'create' })
  @Post('submit')
  submit(@Body() dto: SubmitTossFormDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.submit(dto, user.id);
  }

  // --- 管理(トスフォーム設定) ---
  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Post('fields')
  createField(@Body() dto: CreateTossFormFieldDto) {
    return this.service.createField(dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Patch('fields/:id')
  updateField(@Param('id') id: string, @Body() dto: UpdateTossFormFieldDto) {
    return this.service.updateField(id, dto);
  }

  @RequirePermissions({ resource: 'master', action: 'edit' })
  @Delete('fields/:id')
  deleteField(@Param('id') id: string) {
    return this.service.deleteField(id);
  }
}
