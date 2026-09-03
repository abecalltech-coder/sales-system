import { Module } from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { PreferencesController } from './preferences.controller';

@Module({
  providers: [PreferencesService],
  controllers: [PreferencesController],
})
export class PreferencesModule {}
