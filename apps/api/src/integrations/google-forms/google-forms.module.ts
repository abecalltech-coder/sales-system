import { Module } from '@nestjs/common';
import { GoogleFormsService } from './google-forms.service';
import { GoogleFormsController } from './google-forms.controller';
import { SequenceService } from '../../common/services/sequence.service';
import { StatusResolverService } from '../../common/services/status-resolver.service';
import { SystemSettingsModule } from '../../system-settings/system-settings.module';

@Module({
  imports: [SystemSettingsModule],
  providers: [GoogleFormsService, SequenceService, StatusResolverService],
  controllers: [GoogleFormsController],
})
export class GoogleFormsModule {}
