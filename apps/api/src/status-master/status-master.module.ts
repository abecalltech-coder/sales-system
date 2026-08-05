import { Module } from '@nestjs/common';
import { StatusMasterService } from './status-master.service';
import { StatusMasterController } from './status-master.controller';

@Module({
  providers: [StatusMasterService],
  controllers: [StatusMasterController],
})
export class StatusMasterModule {}
