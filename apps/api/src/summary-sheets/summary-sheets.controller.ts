import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { SummarySheetsService } from './summary-sheets.service';
import { CreateSheetDto, RenameSheetDto, UpsertCellDto } from './dto/summary-sheet.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types';

@Controller('summary-sheets')
export class SummarySheetsController {
  constructor(private readonly service: SummarySheetsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateSheetDto) {
    return this.service.create(dto.name);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() dto: RenameSheetDto) {
    return this.service.rename(id, dto.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Put(':id/cells')
  upsertCell(@Param('id') id: string, @Body() dto: UpsertCellDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.upsertCell(id, dto.row, dto.col, dto.value, user.id);
  }

  @Post(':id/rows')
  addRow(@Param('id') id: string) {
    return this.service.addRow(id);
  }

  @Delete(':id/rows/:row')
  removeRow(@Param('id') id: string, @Param('row') row: string) {
    return this.service.removeRow(id, Number(row));
  }

  @Post(':id/columns')
  addColumn(@Param('id') id: string) {
    return this.service.addColumn(id);
  }

  @Delete(':id/columns/:col')
  removeColumn(@Param('id') id: string, @Param('col') col: string) {
    return this.service.removeColumn(id, Number(col));
  }
}
