import { IsArray, IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTossCaseDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() caseName?: string; // 案件名(未指定時はcorporateNameを使用)
  @IsOptional() @IsString() corporateName?: string; // customerId未指定時、この場で顧客を新規作成する(店舗名)
  @IsOptional() @IsString() contactName?: string; // 担当者名
  @IsOptional() @IsString() phone?: string; // 店舗連絡先
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string; // 住所(都道府県から入力必須)
  @IsOptional() @IsString() postalCode?: string;

  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsUUID() tossUserId?: string;
  @IsOptional() @IsUUID() salesUserId?: string;
  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsDateString() desiredAt?: string;
  @IsOptional() @IsString() statusId?: string; // 未指定ならTOSS_NEWを既定値に使う
  @IsOptional() @IsString() memo?: string; // 備考
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  // トス実績項目
  @IsOptional() @IsString() apStaffName?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() proposal?: string;
  @IsOptional() @IsString() listName?: string;
  @IsOptional() @IsString() callDirection?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() existingContract?: string;
  @IsOptional() @IsString() preConfirmStatusId?: string;
  @IsOptional() @IsString() progressStatusId?: string;
  @IsOptional() @IsString() ngReasonStatusId?: string;
  @IsOptional() @IsDateString() nextActionAt?: string;
}

export class UpdateTossCaseDto {
  @IsInt()
  version!: number;

  @IsOptional() @IsString() caseName?: string;
  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsUUID() tossUserId?: string;
  @IsOptional() @IsUUID() salesUserId?: string;
  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsDateString() desiredAt?: string;
  @IsOptional() @IsDateString() confirmedStartAt?: string;
  @IsOptional() @IsDateString() confirmedEndAt?: string;
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];

  // 顧客側の項目(店舗名/担当者名/店舗連絡先/住所)。customerIdが紐づいている場合のみ反映される。
  @IsOptional() @IsString() corporateName?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() postalCode?: string;

  // トス実績項目
  @IsOptional() @IsString() apStaffName?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() proposal?: string;
  @IsOptional() @IsString() listName?: string;
  @IsOptional() @IsString() callDirection?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsString() hook?: string;
  @IsOptional() @IsString() existingContract?: string;
  @IsOptional() @IsString() preConfirmStatusId?: string;
  @IsOptional() @IsString() progressStatusId?: string;
  @IsOptional() @IsString() ngReasonStatusId?: string;
  @IsOptional() @IsDateString() nextActionAt?: string;

  // ステータスをアポイントへ変更する際に必須で入力する前連日時(セクション追加要望)。
  // TossCase自体には保存せず、アポ案件自動作成時にAppointment.preContactAtへそのまま渡す。
  @IsOptional() @IsDateString() initialPreContactAt?: string;
}

export class BulkUpdateTossCaseDto {
  @IsArray() @IsUUID('4', { each: true }) ids!: string[];
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsUUID() salesUserId?: string;
}

export class SetCallingFlagDto {
  @IsBoolean()
  active!: boolean;
}
