import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class ArriveVisitDto {
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsNumber() accuracy?: number;
  @IsOptional() @IsIn(['GRANTED', 'DENIED', 'FAILED', 'UNSUPPORTED']) locationPermissionStatus?: string;
  @IsOptional() @IsString() comment?: string; // 距離警告時の理由等
  @IsOptional() @IsString() deviceInfo?: string;
}

export class StartMeetingDto {
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
  @IsOptional() @IsBoolean() alsoRegisterArrival?: boolean; // 未到着状態からの同時登録
  @IsOptional() @IsString() comment?: string;
}

export class EndMeetingDto {
  @IsString() meetingResult!: string; // 成約/見込み/再商談/再訪問/保留/失注/不在/キャンセル/対象外
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsString() nextActionDate?: string;
  @IsOptional() @IsString() nextVisitAt?: string;
  @IsOptional() @IsString() meetingMemo?: string;
  @IsOptional() @IsString() customerNeeds?: string;
  @IsOptional() @IsString() rejectionReason?: string;
  @IsOptional() @IsInt() estimatedContractProbability?: number;
  @IsOptional() @IsString() contractExpectedDate?: string;
  @IsOptional() @IsNumber() latitude?: number;
  @IsOptional() @IsNumber() longitude?: number;
}

export class OfflineActionItemDto {
  @IsString() idempotencyKey!: string;
  @IsIn(['ARRIVE', 'START_MEETING', 'END_MEETING', 'COMMENT']) actionType!: string;
  @IsString() targetEntityId!: string;
  payload!: Record<string, unknown>;
  @IsString() capturedAt!: string;
}
