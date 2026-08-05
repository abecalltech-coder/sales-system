import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVisitDto {
  @IsUUID()
  appointmentId!: string;

  @IsOptional()
  @IsIn(['INITIAL', 'REVISIT', 'FINAL_CHECK'])
  visitKind?: string;

  @IsOptional() @IsUUID() fieldSalesUserId?: string;

  @IsDateString()
  scheduledAt!: string;
}

export class UpdateVisitDto {
  @IsInt()
  version!: number;

  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() statusId?: string;
}
