import { IsArray, IsInt, IsObject, IsOptional, IsString, Matches, IsUUID } from 'class-validator';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class GetMonthlySummaryQueryDto {
  @IsString()
  @Matches(PERIOD, { message: 'periodは"YYYY-MM"形式で指定してください' })
  period!: string;

  @IsString()
  departmentId!: string;
}

export class AddSummaryRowDto {
  @IsString()
  @Matches(PERIOD)
  period!: string;

  @IsString()
  departmentId!: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateSummaryRowDto {
  @IsOptional()
  @IsObject()
  valuesPatch?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  role?: string | null;

  @IsOptional()
  @IsUUID('4')
  userId?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class SummaryRowIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}
