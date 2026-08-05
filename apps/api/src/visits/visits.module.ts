import { Module } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { VisitsController } from './visits.controller';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';

@Module({
  providers: [VisitsService, SequenceService, StatusResolverService],
  controllers: [VisitsController],
})
export class VisitsModule {}
