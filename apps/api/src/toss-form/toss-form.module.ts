import { Module } from '@nestjs/common';
import { TossFormService } from './toss-form.service';
import { TossFormController } from './toss-form.controller';
import { TossCasesModule } from '../toss-cases/toss-cases.module';

@Module({
  imports: [TossCasesModule],
  providers: [TossFormService],
  controllers: [TossFormController],
})
export class TossFormModule {}
