import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Allow } from 'class-validator';
import { GoogleCalendarService } from './google-calendar.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public, RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../auth/types';

class CreateMeetDto {
  @Allow()
  title?: string;
}

@Controller('integrations/google-calendar')
export class GoogleCalendarController {
  constructor(private readonly service: GoogleCalendarService) {}

  @RequirePermissions({ resource: 'system', action: 'view' })
  @Get('status')
  status() {
    return this.service.getStatus();
  }

  @RequirePermissions({ resource: 'system', action: 'edit' })
  @Get('auth-url')
  authUrl() {
    return { url: this.service.getAuthUrl() };
  }

  // GoogleからのリダイレクトはCookieを持たないため認証不要。処理後にフロントの連携設定へ戻す。
  @Public()
  @Get('callback')
  async callback(@Query('code') code: string, @Query('error') error: string, @Res() res: Response) {
    const front = process.env.FRONTEND_URL || '';
    if (error || !code) {
      return res.redirect(`${front}/admin/integrations?google=error`);
    }
    try {
      await this.service.handleCallback(code);
      return res.redirect(`${front}/admin/integrations?google=connected`);
    } catch {
      return res.redirect(`${front}/admin/integrations?google=error`);
    }
  }

  @RequirePermissions({ resource: 'system', action: 'edit' })
  @Post('disconnect')
  async disconnect() {
    await this.service.disconnect();
    return { ok: true };
  }

  // アポ詳細に対してMeetを作成(題名は都度指定)。system権限までは要求せず、アポ編集権限で可。
  @RequirePermissions({ resource: 'appointment', action: 'edit' })
  @Post('appointments/:id/create-meet')
  createMeet(@Param('id') id: string, @Body() dto: CreateMeetDto, @CurrentUser() _user: AuthenticatedUser) {
    return this.service.createMeetForAppointment(id, dto.title);
  }
}
