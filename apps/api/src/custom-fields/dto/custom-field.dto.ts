import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const ENTITY_TYPES = ['CUSTOMER', 'TOSS', 'APPOINTMENT', 'VISIT', 'CONTRACT'] as const;
const DATA_TYPES = [
  'TEXT', 'TEXTAREA', 'INT', 'DECIMAL', 'CURRENCY', 'PHONE', 'EMAIL', 'URL',
  'DATE', 'DATETIME', 'TIME', 'SELECT', 'MULTISELECT', 'CHECKBOX',
  'USER', 'DEPT', 'TEAM', 'PRODUCT', 'FORMULA',
] as const;

class OptionDto {
  @IsString() label!: string;
  @IsString() value!: string;
  @IsOptional() @IsInt() order?: number;
}

export class CreateCustomFieldDto {
  @IsIn(ENTITY_TYPES) entityType!: (typeof ENTITY_TYPES)[number];

  // 一度使ったら変更不可(値テーブルとの整合性のため)
  @IsString() fieldKey!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(DATA_TYPES) dataType!: (typeof DATA_TYPES)[number];

  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() defaultValue?: string;
  @IsOptional() @IsString() placeholder?: string;

  @IsOptional() @IsBoolean() showInList?: boolean;
  @IsOptional() @IsBoolean() showInDetail?: boolean;
  @IsOptional() @IsBoolean() showInCreate?: boolean;
  @IsOptional() @IsBoolean() showInEdit?: boolean;
  @IsOptional() @IsBoolean() searchable?: boolean;
  @IsOptional() @IsBoolean() filterable?: boolean;
  @IsOptional() @IsBoolean() csvExportable?: boolean;
  @IsOptional() @IsBoolean() csvImportable?: boolean;
  @IsOptional() @IsInt() order?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options?: OptionDto[]; // SELECT/MULTISELECT用の選択肢
}

export class UpdateCustomFieldDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() defaultValue?: string;
  @IsOptional() @IsString() placeholder?: string;
  @IsOptional() @IsBoolean() showInList?: boolean;
  @IsOptional() @IsBoolean() showInDetail?: boolean;
  @IsOptional() @IsBoolean() showInCreate?: boolean;
  @IsOptional() @IsBoolean() showInEdit?: boolean;
  @IsOptional() @IsBoolean() searchable?: boolean;
  @IsOptional() @IsBoolean() filterable?: boolean;
  @IsOptional() @IsBoolean() csvExportable?: boolean;
  @IsOptional() @IsBoolean() csvImportable?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SetCustomFieldValueDto {
  @IsString() entityType!: string;
  @IsString() entityId!: string;
  @IsString() fieldId!: string;
  value!: string | number | boolean | null;
}
