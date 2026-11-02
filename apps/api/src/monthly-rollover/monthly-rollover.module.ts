import { Module } from '@nestjs/common';
import { MonthlySummaryModule } from '../monthly-summary/monthly-summary.module';
import { MonthlyRolloverService } from './monthly-rollover.service';

@Module({
  imports: [MonthlySummaryModule],
  providers: [MonthlyRolloverService],
})
export class MonthlyRolloverModule {}
