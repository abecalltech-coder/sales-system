import { IsDateString, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateEntryDto {
  @IsUUID()
  contractId!: string;

  @IsOptional() @IsString() entryUserId?: string;
  @IsOptional() @IsString() statusId?: string; // 未指定ならNOT_ENTEREDを既定値に使う
  @IsOptional() @IsString() applicationNumber?: string;
}

export class UpdateEntryDto {
  @IsInt()
  version!: number;

  @IsOptional() @IsString() entryUserId?: string;
  @IsOptional() @IsDateString() entryAt?: string;
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsString() applicationNumber?: string;
  @IsOptional() @IsString() deficiencyNote?: string;
  @IsOptional() @IsDateString() resolvedAt?: string;
  @IsOptional() @IsDateString() approvedAt?: string;
  @IsOptional() @IsString() memo?: string;
}
