import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateTossFormFieldDto {
  @IsString() targetKey!: string;
  @IsString() label!: string;
  @IsOptional() @IsString() fieldType?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() helpText?: string;
  @IsOptional() @IsString() optionsMode?: string;
  @IsOptional() @IsString() masterCategory?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) staticOptions?: string[];
}

export class UpdateTossFormFieldDto {
  @IsOptional() @IsString() targetKey?: string;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() fieldType?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() helpText?: string | null;
  @IsOptional() @IsString() optionsMode?: string;
  @IsOptional() @IsString() masterCategory?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) staticOptions?: string[];
}

export class SubmitTossFormDto {
  @IsObject() answers!: Record<string, string | string[] | null>;
}
