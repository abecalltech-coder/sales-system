import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const DATA_SOURCES = ['TOSS', 'APPOINTMENT', 'VISIT', 'CONTRACT', 'ENTRY'] as const;
export const AXES = ['USER', 'TEAM', 'DEPARTMENT', 'PRODUCT', 'WEEK', 'MONTH'] as const;
export const METRICS = ['COUNT', 'CONVERSION_RATE', 'RANKING'] as const;
export const PRESETS = ['THIS_MONTH', 'LAST_MONTH', 'THIS_WEEK', 'LAST_WEEK'] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportConfigDto {
  @IsIn(DATA_SOURCES)
  dataSource!: (typeof DATA_SOURCES)[number];

  @IsIn(AXES)
  axis!: (typeof AXES)[number];

  @IsArray()
  @IsIn(METRICS, { each: true })
  metrics!: (typeof METRICS)[number][];

  @IsIn(['PRESET', 'CUSTOM'])
  periodMode!: 'PRESET' | 'CUSTOM';

  @IsOptional()
  @IsIn(PRESETS)
  preset?: (typeof PRESETS)[number];

  @IsOptional()
  @IsString()
  @Matches(DATE_RE)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE)
  endDate?: string;
}

export class PreviewReportDto {
  @ValidateNested()
  @Type(() => ReportConfigDto)
  config!: ReportConfigDto;
}

export class CreateCustomReportDto {
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => ReportConfigDto)
  config!: ReportConfigDto;
}

export class UpdateCustomReportDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportConfigDto)
  config?: ReportConfigDto;
}

export class ReorderCustomReportsDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export interface ReportRow {
  axisKey: string;
  axisLabel: string;
  count: number;
  conversionRate: number | null;
  rank: number | null;
}
