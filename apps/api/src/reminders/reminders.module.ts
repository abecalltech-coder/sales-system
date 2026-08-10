import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PushNotificationsModule],
  providers: [RemindersService],
})
export class RemindersModule {}
