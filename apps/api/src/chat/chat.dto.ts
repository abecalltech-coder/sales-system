import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

// 画像は端末側で縮小した data URL。ここでは上限だけ確認する(約3MB)
const IMAGE_MAX = 3_000_000;

export class CreateRoomDto {
  @IsString() @MaxLength(60) name!: string;
  @IsOptional() @IsString() @MaxLength(IMAGE_MAX) photo?: string;
  @IsArray() @IsString({ each: true }) @ArrayMaxSize(1000) memberIds!: string[];
}

export class UpdateRoomDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  /** null/空文字で写真を外す */
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(IMAGE_MAX) photo?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(1000) memberIds?: string[];
}

export class SendMessageDto {
  @IsOptional() @IsString() @MaxLength(10000) body?: string;
  @IsOptional() @IsString() @MaxLength(IMAGE_MAX) image?: string;
  @IsOptional() @IsString() replyToId?: string;
  /** メンションするユーザーID("all" で全員) */
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(1000) mentions?: string[];
}

export const NOTIFY_MODES = ['ALL', 'MENTION', 'OFF'] as const;
export type NotifyMode = (typeof NOTIFY_MODES)[number];

export class NotifySettingDto {
  @IsString() @MaxLength(2000) endpoint!: string;
  @IsIn(NOTIFY_MODES) mode!: NotifyMode;
}

export class ForwardDto {
  @IsArray() @IsString({ each: true }) @ArrayMinSize(1) @ArrayMaxSize(200) messageIds!: string[];
  @IsArray() @IsString({ each: true }) @ArrayMinSize(1) @ArrayMaxSize(50) targetRoomIds!: string[];
}

export class UpdateProfileDto {
  /** アカウント写真(縮小済み data URL)。null/空文字で外す */
  @ValidateIf((_o, v) => v !== null) @IsString() @MaxLength(IMAGE_MAX) iconUrl!: string | null;
}
