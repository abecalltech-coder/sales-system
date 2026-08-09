import { Module } from '@nestjs/common';
import { AppointmentReportsService } from './appointment-reports.service';
import { AppointmentReportsController } from './appointment-reports.controller';

@Module({
  providers: [AppointmentReportsService],
  controllers: [AppointmentReportsController],
})
export class AppointmentReportsModule {}
