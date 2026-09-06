import { IsArray, IsInt, IsObject, IsOptional, IsString, Matches, IsUUID } from 'class-validator';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export class GetMonthlyShiftQueryDto {
  @IsString()
  @Matches(PERIOD, { message: 'periodは"YYYY-MM"形式で指定してください' })
  period!: string;
}

export class AddShiftRowDto {
  @IsString()
  @Matches(PERIOD)
  period!: string;

  @IsOptional()
  @IsUUID('4')
  userId?: string;
}

export class UpdateShiftRowDto {
  @IsOptional()
  @IsObject()
  attributesPatch?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  daysPatch?: Record<string, number | null>;

  @IsOptional()
  @IsUUID('4')
  userId?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class ShiftRowIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}
