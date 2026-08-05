import { IsDateString, IsOptional, IsString } from 'class-validator';

export class SummaryQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() productId?: string;
}
