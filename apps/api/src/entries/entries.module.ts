import { Module } from '@nestjs/common';
import { EntriesService } from './entries.service';
import { EntriesController } from './entries.controller';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';

@Module({
  providers: [EntriesService, SequenceService, StatusResolverService, CaseHistoryService],
  controllers: [EntriesController],
})
export class EntriesModule {}
