import { Module } from '@nestjs/common';
import { TossCasesService } from './toss-cases.service';
import { TossCasesController } from './toss-cases.controller';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [AppointmentsModule],
  providers: [TossCasesService, SequenceService, StatusResolverService, CaseHistoryService],
  controllers: [TossCasesController],
  exports: [TossCasesService],
})
export class TossCasesModule {}
