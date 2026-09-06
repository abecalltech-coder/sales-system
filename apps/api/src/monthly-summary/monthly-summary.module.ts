import { Module } from '@nestjs/common';
import { MonthlySummaryController } from './monthly-summary.controller';
import { MonthlySummaryService } from './monthly-summary.service';
import { SummaryAggregationService } from './aggregation.service';

@Module({
  controllers: [MonthlySummaryController],
  providers: [MonthlySummaryService, SummaryAggregationService],
  exports: [MonthlySummaryService],
})
export class MonthlySummaryModule {}
