import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

enum MeetingTypeDto {
  VISIT = 'VISIT',
  GOOGLE_MEET = 'GOOGLE_MEET',
  PHONE = 'PHONE',
  OTHER = 'OTHER',
}

/** CLカレンダーから直接予定を作成する場合に使う(トス経由の自動作成とは別ルート) */
export class CreateAppointmentDto {
  @IsOptional() @IsString() corporateName?: string;
  @IsOptional() @IsUUID() meetingUserId?: string;
  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsString() snapshotDepartmentId?: string;
  @IsOptional() @IsString() closerStatusId?: string;
  @IsDateString() meetingStartAt!: string;
  @IsOptional() @IsDateString() meetingEndAt?: string;
  @IsOptional() @IsEnum(MeetingTypeDto) meetingType?: MeetingTypeDto;
  @IsOptional() @IsString() visitAddress?: string;
  @IsOptional() @IsString() calendarColor?: string;
  @IsOptional() @IsString() calendarTitleCustom?: string; // CLカレンダーで手入力した題名
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) reminderMinutesBefore?: number;
}

export class UpdateAppointmentDto {
  @IsInt()
  version!: number;

  @IsOptional() @IsUUID() apoUserId?: string;
  @IsOptional() @IsString() caseName?: string;
  @IsOptional() @IsUUID() meetingUserId?: string;
  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsDateString() meetingStartAt?: string;
  @IsOptional() @IsDateString() meetingEndAt?: string;
  @IsOptional() @IsEnum(MeetingTypeDto) meetingType?: MeetingTypeDto;
  @IsOptional() @IsString() visitAddress?: string;
  @IsOptional() @IsString() meetingStatusId?: string; // StatusMaster.id (category=APPOINTMENT)
  @IsOptional() @IsString() meetingResultId?: string;
  @IsOptional() @IsDateString() nextActionAt?: string; // 決着予定日
  @IsOptional() @IsString() memo?: string; // 備考

  // 顧客側の項目(店舗名/担当者名/店舗連絡先/住所/メールアドレス)
  @IsOptional() @IsString() corporateName?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() email?: string;

  // アポ実績項目
  @IsOptional() @IsString() apStaffName?: string;
  @IsOptional() @IsString() preConfirmStatusId?: string;
  @IsOptional() @IsString() preContactStatusId?: string;
  @IsOptional() @IsString() closerStatusId?: string;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsDateString() importantMattersOkAt?: string;
  @IsOptional() @IsDateString() electronicContractAt?: string;
  @IsOptional() @IsString() hpProgressStatusId?: string;
  @IsOptional() @IsString() typeStatusId?: string;
  @IsOptional() @IsString() progressStatusId?: string;
  @IsOptional() @IsString() listName?: string;
  @IsOptional() @IsString() acquisitionMethodStatusId?: string;
  @IsOptional() @IsString() proposalLocation?: string;
  @IsOptional() @IsString() existingContract?: string;

  @IsOptional() @IsBoolean() anshinBizProposed?: boolean;
  @IsOptional() @IsString() anshinBizStatusId?: string;
  @IsOptional() @IsString() anshinBizLostReasonStatusId?: string;
  @IsOptional() @IsInt() anshinBizPoints?: number;

  @IsOptional() @IsBoolean() mobileProposed?: boolean;
  @IsOptional() @IsString() mobileStatusId?: string;
  @IsOptional() @IsString() mobileLostReasonStatusId?: string;

  @IsOptional() @IsBoolean() funfoProposed?: boolean;
  @IsOptional() @IsString() funfoStatusId?: string;
  @IsOptional() @IsString() funfoLostReasonStatusId?: string;

  @IsOptional() @IsString() deductionNote?: string;
  @IsOptional() @IsString() consentFormTypeStatusId?: string;
  @IsOptional() @IsString() acquiredCompanyName?: string;
  @IsOptional() @IsString() deliveryMethodStatusId?: string;
  @IsOptional() @IsString() deliveryStatusStatusId?: string;
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsString() specialNotes?: string;
  @IsOptional() @IsString() calendarColor?: string; // CLカレンダー表示色
  // calendarTitleは「部署 CL名字 都道府県【フック】店舗名」で自動組み立て。【】に入るのは hook(商談形式)。
  // CLカレンダーで手入力した題名は calendarTitleCustom に保存し、自動より優先する(null/空で自動に戻す)
  @IsOptional() @IsString() calendarTitleCustom?: string | null;
  @IsOptional() @IsString() meetingUrl?: string;
  @IsOptional() @IsDateString() preContactAt?: string; // 前連日時
  @IsOptional() @IsBoolean() reminderEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) reminderMinutesBefore?: number;
}

/**
 * 一括投入(要望): 外部シートを貼り付けてまとめてアポ詳細を作成する。
 * CLカレンダー直接作成用のCreateAppointmentDto(meetingStartAt必須・項目少なめ)とは
 * 用途が異なるため別DTOにする。
 */
export class CreateAppointmentBulkRowDto {
  @IsOptional() @IsDateString() createdAt?: string; // アポ日
  @IsOptional() @IsDateString() meetingStartAt?: string; // 商談日+商談時間
  @IsOptional() @IsString() apStaffName?: string;
  @IsOptional() @IsString() preConfirmStatusId?: string;
  @IsOptional() @IsString() preContactStatusId?: string;
  @IsOptional() @IsString() closerStatusId?: string;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() department?: string; // StatusMaster.id(category=DEPARTMENT_BRANCH)
  @IsOptional() @IsString() corporateName?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsDateString() importantMattersOkAt?: string;
  @IsOptional() @IsDateString() electronicContractAt?: string;
  @IsOptional() @IsDateString() nextActionAt?: string;
  @IsOptional() @IsString() typeStatusId?: string;
  @IsOptional() @IsString() progressStatusId?: string;
  @IsOptional() @IsString() listName?: string;
  @IsOptional() @IsString() acquisitionMethodStatusId?: string;
  @IsOptional() @IsString() proposalLocation?: string;
  @IsOptional() @IsString() existingContract?: string;
  @IsOptional() @IsBoolean() anshinBizProposed?: boolean;
  @IsOptional() @IsString() anshinBizStatusId?: string;
  @IsOptional() @IsString() anshinBizLostReasonStatusId?: string;
  @IsOptional() @IsInt() anshinBizPoints?: number;
  @IsOptional() @IsBoolean() mobileProposed?: boolean;
  @IsOptional() @IsString() mobileStatusId?: string;
  @IsOptional() @IsString() mobileLostReasonStatusId?: string;
  @IsOptional() @IsBoolean() funfoProposed?: boolean;
  @IsOptional() @IsString() funfoStatusId?: string;
  @IsOptional() @IsString() funfoLostReasonStatusId?: string;
  @IsOptional() @IsString() deductionNote?: string;
  @IsOptional() @IsString() consentFormTypeStatusId?: string;
  @IsOptional() @IsString() deliveryMethodStatusId?: string;
  @IsOptional() @IsString() deliveryStatusStatusId?: string;
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsString() specialNotes?: string;
}

export class BulkCreateAppointmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAppointmentBulkRowDto)
  rows!: CreateAppointmentBulkRowDto[];
}
