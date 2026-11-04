import { IsArray, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

enum UserStatusDto {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  RETIRED = 'RETIRED',
}

export class UpdateUserDto {
  @IsInt()
  version!: number; // 楽観的ロック: 編集開始時点のversionを必須で送る

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsEnum(UserStatusDto)
  status?: UserStatusDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];

  // APランク(トークスクリプトで最初に開くランク)。null で未設定に戻す
  @IsOptional()
  @IsIn(['BRONZE', 'SILVER', 'GOLD'])
  talkRank?: string | null;
}
