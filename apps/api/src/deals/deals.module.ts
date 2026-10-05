import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { GoogleCalendarModule } from '../integrations/google-calendar/google-calendar.module';
import { DealSheetSyncController } from './sheet-sync.controller';
import { DealSheetSyncService } from './sheet-sync.service';

@Module({
  imports: [GoogleCalendarModule],
  controllers: [DealsController, DealSheetSyncController],
  providers: [DealsService, DealSheetSyncService],
})
export class DealsModule {}
