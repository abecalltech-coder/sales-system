import { Module } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { MobileController, OfflineActionsController } from './mobile.controller';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [AppointmentsModule],
  providers: [VisitsService, SequenceService, StatusResolverService],
  controllers: [VisitsController, MobileController, OfflineActionsController],
})
export class VisitsModule {}
