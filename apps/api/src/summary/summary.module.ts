import { Module } from '@nestjs/common';
import { SummaryService } from './summary.service';
import { SummaryController } from './summary.controller';

@Module({
  providers: [SummaryService],
  controllers: [SummaryController],
})
export class SummaryModule {}
