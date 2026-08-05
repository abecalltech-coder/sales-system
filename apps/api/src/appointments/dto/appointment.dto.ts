import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

enum MeetingTypeDto {
  VISIT = 'VISIT',
  GOOGLE_MEET = 'GOOGLE_MEET',
  PHONE = 'PHONE',
  OTHER = 'OTHER',
}

export class UpdateAppointmentDto {
  @IsInt()
  version!: number;

  @IsOptional() @IsUUID() apoUserId?: string;
  @IsOptional() @IsUUID() meetingUserId?: string;
  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsDateString() meetingStartAt?: string;
  @IsOptional() @IsDateString() meetingEndAt?: string;
  @IsOptional() @IsEnum(MeetingTypeDto) meetingType?: MeetingTypeDto;
  @IsOptional() @IsString() visitAddress?: string;
  @IsOptional() @IsString() meetingStatusId?: string; // StatusMaster.id (category=APPOINTMENT)
  @IsOptional() @IsString() meetingResultId?: string;
  @IsOptional() @IsDateString() nextActionAt?: string;
  @IsOptional() @IsString() memo?: string;
}
