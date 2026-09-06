import { Module } from '@nestjs/common';
import { MonthlyShiftController } from './monthly-shift.controller';
import { MonthlyShiftService } from './monthly-shift.service';

@Module({
  controllers: [MonthlyShiftController],
  providers: [MonthlyShiftService],
  exports: [MonthlyShiftService],
})
export class MonthlyShiftModule {}
