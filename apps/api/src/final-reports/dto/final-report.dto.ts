import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches } from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export class GetEntriesQueryDto {
  @IsString()
  @Matches(PERIOD_RE, { message: 'periodは"YYYY-MM"形式で指定してください' })
  period!: string;

  /** 管理者が他ユーザーの分を見る場合(未指定なら自分) */
  @IsOptional()
  @IsString()
  userId?: string;
}

export class UpsertEntryDto {
  @IsString()
  @Matches(DATE_RE, { message: 'dateは"YYYY-MM-DD"形式で指定してください' })
  date!: string;

  @IsObject()
  valuesPatch!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class CreateFieldDto {
  @IsString()
  label!: string;

  @IsOptional()
  @IsIn(['NUMBER', 'TEXT'])
  fieldType?: 'NUMBER' | 'TEXT';

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsIn(['NUMBER', 'TEXT'])
  fieldType?: 'NUMBER' | 'TEXT';

  @IsOptional()
  @IsString()
  computed?: string | null;

  @IsOptional()
  @IsString()
  unit?: string | null;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
