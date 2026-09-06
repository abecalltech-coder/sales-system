import { Module } from '@nestjs/common';
import { MonthlySummaryModule } from '../monthly-summary/monthly-summary.module';
import { MonthlyShiftModule } from '../monthly-shift/monthly-shift.module';
import { MonthlyRolloverService } from './monthly-rollover.service';

@Module({
  imports: [MonthlySummaryModule, MonthlyShiftModule],
  providers: [MonthlyRolloverService],
})
export class MonthlyRolloverModule {}
