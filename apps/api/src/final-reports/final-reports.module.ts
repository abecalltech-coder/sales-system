import { Module } from '@nestjs/common';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { FinalReportsController } from './final-reports.controller';
import { FinalReportsService } from './final-reports.service';
import { FinalReportsAlertService } from './final-reports.alert';

@Module({
  imports: [PushNotificationsModule],
  controllers: [FinalReportsController],
  providers: [FinalReportsService, FinalReportsAlertService],
})
export class FinalReportsModule {}
