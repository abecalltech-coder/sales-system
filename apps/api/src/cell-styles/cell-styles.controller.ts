import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { CellStylesService } from './cell-styles.service';

// DataTable の tableKey と同じ形式(例: "toss-cases", "monthly-shift:xxx")
const TABLE_KEY_PATTERN = /^[A-Za-z0-9_:-]{1,64}$/;

class CellRefDto {
  @IsString() rowId!: string;
  @IsString() columnKey!: string;
}

class SetCellStyleDto {
  @Matches(TABLE_KEY_PATTERN) tableKey!: string;
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => CellRefDto)
  cells!: CellRefDto[];
  /** "#rrggbb"。null で文字色を解除。省略時は変更しない */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  textColor?: string | null;
  /** 太字。省略時は変更しない */
  @IsOptional()
  @IsBoolean()
  bold?: boolean;
}

/**
 * 一覧のセル単位の書式(文字色・太字。要望: 画面上でスプレッドシートのように変える。全員で共有)。
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
  set(@Body() dto: SetCellStyleDto) {
    return this.service.setStyle(dto.tableKey, dto.cells, { textColor: dto.textColor, bold: dto.bold });
  }
}
