import { Module } from '@nestjs/common';
import { CellStylesController } from './cell-styles.controller';
import { CellStylesService } from './cell-styles.service';

@Module({
  providers: [CellStylesService],
  controllers: [CellStylesController],
})
export class CellStylesModule {}
