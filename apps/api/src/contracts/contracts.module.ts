import { Module } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { SequenceService } from '../common/services/sequence.service';
import { StatusResolverService } from '../common/services/status-resolver.service';
import { CaseHistoryService } from '../common/services/case-history.service';

@Module({
  providers: [ContractsService, SequenceService, StatusResolverService, CaseHistoryService],
  controllers: [ContractsController],
  exports: [ContractsService],
})
export class ContractsModule {}
