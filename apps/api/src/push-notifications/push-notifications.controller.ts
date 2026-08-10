import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push-subscription.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { Public } from '../common/decorators/permissions.decorator';

@Controller('push')
export class PushNotificationsController {
  constructor(private readonly service: PushNotificationsService) {}

  // 公開鍵はフロントのpushManager.subscribe()に必要なだけで秘匿情報ではない
  @Public()
  @Get('vapid-public-key')
  getPublicKey() {
    return this.service.getPublicKey();
  }

  @Post('subscribe')
  subscribe(@Body() dto: SubscribePushDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.subscribe(user.id, dto);
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: UnsubscribePushDto) {
    return this.service.unsubscribe(dto.endpoint);
  }
}
