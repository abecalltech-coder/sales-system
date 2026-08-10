import { Module } from '@nestjs/common';
import { AppointmentReportsService } from './appointment-reports.service';
import { AppointmentReportsController } from './appointment-reports.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PushNotificationsModule],
  providers: [AppointmentReportsService],
  controllers: [AppointmentReportsController],
})
export class AppointmentReportsModule {}
