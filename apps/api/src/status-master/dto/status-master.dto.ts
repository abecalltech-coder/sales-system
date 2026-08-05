import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const CATEGORIES = ['TOSS', 'APPOINTMENT', 'VISIT', 'MATCHING', 'ENTRY'] as const;

export class CreateStatusMasterDto {
  @IsIn(CATEGORIES)
  category!: (typeof CATEGORIES)[number];

  // 自動処理判定に使う固定コード。作成後は変更不可(既存の自動処理ルール・案件データとの整合性を保つため)。
  @IsString()
  internalCode!: string;

  @IsString()
  displayName!: string;

  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsInt() order?: number;
}

export class UpdateStatusMasterDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
