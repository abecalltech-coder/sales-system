import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { CaseHistoryService } from '../common/services/case-history.service';

@Module({
  providers: [CustomersService, CaseHistoryService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
