import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateContractDto {
  @IsInt()
  version!: number;

  @IsOptional() @IsString() contractUserId?: string;
  @IsOptional() @IsDateString() contractedAt?: string;
  @IsOptional() @IsNumber() contractAmount?: number;
  @IsOptional() @IsNumber() revenueForecast?: number;
  @IsOptional() @IsNumber() feeForecast?: number;
  @IsOptional() @IsString() contractNumber?: string;
  @IsOptional() @IsString() applicationNumber?: string;
  @IsOptional() @IsString() matchingStatusId?: string; // StatusMaster.id (category=MATCHING)
  @IsOptional() @IsDateString() matchingAt?: string;
  @IsOptional() @IsDateString() switchingScheduledAt?: string;
  @IsOptional() @IsDateString() switchingAt?: string;
  @IsOptional() @IsString() deficiencyNote?: string;
  @IsOptional() @IsDateString() nextActionAt?: string;
  @IsOptional() @IsString() memo?: string;
}
