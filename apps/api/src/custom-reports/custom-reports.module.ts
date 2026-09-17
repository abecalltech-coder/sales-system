import { Module } from '@nestjs/common';
import { CustomReportsController } from './custom-reports.controller';
import { CustomReportsService } from './custom-reports.service';
import { ReportEngineService } from './report-engine.service';

@Module({
  controllers: [CustomReportsController],
  providers: [CustomReportsService, ReportEngineService],
})
export class CustomReportsModule {}
