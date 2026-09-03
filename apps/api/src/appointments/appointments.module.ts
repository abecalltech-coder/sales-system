import { Module } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { ContractsModule } from '../contracts/contracts.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { GoogleCalendarModule } from '../integrations/google-calendar/google-calendar.module';

@Module({
  imports: [ContractsModule, SystemSettingsModule, GoogleCalendarModule],
  providers: [AppointmentsService, SequenceService, StatusResolverService, CaseHistoryService],
  controllers: [AppointmentsController],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
