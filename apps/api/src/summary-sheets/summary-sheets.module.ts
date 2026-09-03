import { Module } from '@nestjs/common';
import { SummarySheetsService } from './summary-sheets.service';
import { SummarySheetsController } from './summary-sheets.controller';

@Module({
  providers: [SummarySheetsService],
  controllers: [SummarySheetsController],
})
export class SummarySheetsModule {}
