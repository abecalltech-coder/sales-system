import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { CellStylesService } from './cell-styles.service';

// DataTable の tableKey と同じ形式(例: "toss-cases", "monthly-shift:xxx")
const TABLE_KEY_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;

class CellRefDto {
  @IsString() rowId!: string;
  @IsString() columnKey!: string;
}

class SetCellTextColorDto {
  @Matches(TABLE_KEY_PATTERN) tableKey!: string;
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CellRefDto)
  cells!: CellRefDto[];
  /** "#rrggbb"。null で文字色を解除 */
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor?: string | null;
}

/**
 * 一覧のセル単位の文字色(要望: 画面上でスプレッドシートのように文字色を変える。全員で共有)。
 * 認証済みユーザーなら誰でも変更できる(見た目だけのため権限は設けない)。
 */
@Controller('cell-styles')
export class CellStylesController {
  constructor(private readonly service: CellStylesService) {}

  @Get()
  list(@Query('tableKey') tableKey: string) {
    if (!TABLE_KEY_PATTERN.test(tableKey ?? '')) throw new BadRequestException('tableKey が不正です');
    return this.service.list(tableKey);
  }

  @Put()
  set(@Body() dto: SetCellTextColorDto) {
    return this.service.setTextColor(dto.tableKey, dto.cells, dto.textColor ?? null);
  }
}
