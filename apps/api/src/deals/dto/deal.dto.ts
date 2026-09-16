import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

const DATA_TYPES = ['TEXT', 'DATE', 'SELECT', 'USER'] as const;

export class ListDealsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number = 100;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export class CreateDealDto {
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;
}

export class UpdateDealDto {
  @IsInt()
  version!: number;

  @IsObject()
  values!: Record<string, unknown>;
}

export class CreateDealFieldDto {
  @IsString()
  label!: string;

  @IsIn(DATA_TYPES)
  dataType!: (typeof DATA_TYPES)[number];

  @IsOptional()
  @IsInt()
  order?: number;

  /** SELECT型のとき、初期選択肢のラベル一覧 */
  @IsOptional()
  options?: string[];
}

export class UpdateDealFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateDealFieldOptionDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateDealFieldOptionDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
