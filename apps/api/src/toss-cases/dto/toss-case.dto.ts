import { IsArray, IsDateString, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTossCaseDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsString() corporateName?: string; // customerId未指定時、この場で顧客を新規作成する
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;

  @IsOptional() @IsUUID() productId?: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsOptional() @IsUUID() tossUserId?: string;
  @IsOptional() @IsUUID() salesUserId?: string;
  @IsOptional() @IsUUID() fieldSalesUserId?: string;
  @IsOptional() @IsDateString() desiredAt?: string;
  @IsOptional() @IsString() statusId?: string; // 未指定ならTOSS_NEWを既定値に使う
  @IsOptional() @IsString() memo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}

export class UpdateTossCaseDto {
  @IsInt()
  version!: number;

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
}

export class BulkUpdateTossCaseDto {
  @IsArray() @IsUUID('4', { each: true }) ids!: string[];
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsUUID() salesUserId?: string;
}
