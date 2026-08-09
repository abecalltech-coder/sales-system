import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

export const REPORT_CHECKPOINTS = [
  'PRE_CONTACT_RESULT',
  'DEPARTED',
  'ARRIVED',
  'ARRIVED_WAITING',
  'VISIT_RESULT',
  'ONLINE_WAITING',
  'ONLINE_RESULT',
  'RESCHEDULE',
] as const;

export class CreateAppointmentReportDto {
  @IsUUID()
  appointmentId!: string;

  @IsIn(REPORT_CHECKPOINTS)
  checkpoint!: (typeof REPORT_CHECKPOINTS)[number];

  @IsString()
  @MinLength(1)
  reportText!: string;
}
