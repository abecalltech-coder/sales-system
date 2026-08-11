import { Body, Controller, Get, Headers, Post, Put } from '@nestjs/common';
import { GoogleFormsService } from './google-forms.service';
import { GoogleFormWebhookDto, SetGoogleFormUrlDto } from './dto/google-form-webhook.dto';
import { Public, RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('integrations/google-forms')
export class GoogleFormsController {
  constructor(private readonly service: GoogleFormsService) {}

  // Apps Script(フォーム回答トリガー)から送られてくるWebhook。認証Cookieを持たないため@Publicとし、
  // 代わりに専用シークレット(x-webhook-secretヘッダー)で検証する。
  @Public()
  @Post('webhook')
  handleWebhook(@Headers('x-webhook-secret') secret: string | undefined, @Body() dto: GoogleFormWebhookDto) {
    return this.service.handleWebhook(secret, dto);
  }

  @RequirePermissions({ resource: 'system', action: 'view' })
  @Get('config')
  getConfig() {
    return this.service.getConfig();
  }

  @RequirePermissions({ resource: 'system', action: 'edit' })
  @Put('config')
  setFormUrl(@Body() dto: SetGoogleFormUrlDto) {
    return this.service.setFormUrl(dto.formUrl);
  }

  @RequirePermissions({ resource: 'system', action: 'edit' })
  @Post('regenerate-secret')
  async regenerateSecret() {
    const webhookSecret = await this.service.regenerateSecret();
    return { webhookSecret };
  }

  @RequirePermissions({ resource: 'system', action: 'view' })
  @Get('logs')
  listLogs() {
    return this.service.listLogs();
  }
}
