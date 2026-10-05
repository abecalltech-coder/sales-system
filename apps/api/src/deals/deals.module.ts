import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DealAutoTasksService } from './deal-auto-tasks.service';

@Module({
  controllers: [DealsController],
  providers: [DealsService, DealAutoTasksService],
})
export class DealsModule {}
