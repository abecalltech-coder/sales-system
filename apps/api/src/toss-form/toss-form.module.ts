import { Module } from '@nestjs/common';
import { TossFormService } from './toss-form.service';
import { TossFormController } from './toss-form.controller';
import { ApoFormController } from './apo-form.controller';
import { TossCasesModule } from '../toss-cases/toss-cases.module';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [TossCasesModule, AppointmentsModule],
  providers: [TossFormService],
  controllers: [TossFormController, ApoFormController],
})
export class TossFormModule {}
