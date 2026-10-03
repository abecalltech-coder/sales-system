import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

const CATEGORIES = [
  'TOSS',
  'APPOINTMENT',
  'VISIT',
  'MATCHING',
  'TOSS_PRE_CONFIRM',
  'TOSS_PROGRESS',
  'TOSS_NG_REASON',
  'APPOINTMENT_PRE_CONTACT',
  'APPOINTMENT_CLOSER',
  'APPOINTMENT_HP_PROGRESS',
  'APPOINTMENT_TYPE',
  'APPOINTMENT_PROGRESS',
  'APPOINTMENT_ACQUISITION_METHOD',
  'APPOINTMENT_ANSHIN_BIZ_STATUS',
  'APPOINTMENT_ANSHIN_BIZ_LOST_REASON',
  'APPOINTMENT_MOBILE_STATUS',
  'APPOINTMENT_MOBILE_LOST_REASON',
  'APPOINTMENT_FUNFO_STATUS',
  'APPOINTMENT_FUNFO_LOST_REASON',
  'APPOINTMENT_CONSENT_FORM_TYPE',
  'APPOINTMENT_DELIVERY_METHOD',
  'APPOINTMENT_DELIVERY_STATUS',
  'DEPARTMENT_BRANCH',
  'TOSS_HOOK_LABEL_MAP',
  // 共通をオフにした項目のアポ実績用(master-share.ts)
  'MEETING_FORMAT@APPOINTMENT',
  'TOSS_PRE_CONFIRM@APPOINTMENT',
  'INDUSTRY@APPOINTMENT',
  'EXISTING_CONTRACT@APPOINTMENT',
  'PROPOSAL_LOCATION@APPOINTMENT',
] as const;

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

export class SetShareDto {
  @IsBoolean() shared!: boolean;
}

export class UpdateStatusMasterDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() onlineColor?: string;
  /** 空文字で解除 */
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
