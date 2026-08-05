import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

// セクション30の自動処理アクション一覧(固定文字列で判定。表示名変更の影響を受けない)
const ACTIONS = [
  'CREATE_APPOINTMENT',
  'CREATE_VISIT',
  'CREATE_CONTRACT',
  'CREATE_ENTRY',
  'CREATE_CALENDAR_EVENT',
  'UPDATE_CALENDAR_EVENT',
  'CANCEL_CALENDAR_EVENT',
  'CREATE_MEET',
  'SET_MATCHING_DATE_IF_EMPTY',
  'SET_SWITCHING_DATE_IF_EMPTY',
  'NOTIFY_ASSIGNEE',
  'NOTIFY_ADMIN',
] as const;

export class CreateAutomationRuleDto {
  @IsString() statusMasterId!: string;
  @IsIn(ACTIONS) action!: (typeof ACTIONS)[number];
  @IsOptional() @IsObject() config?: Record<string, unknown>;
}

export class UpdateAutomationRuleDto {
  @IsOptional() @IsObject() config?: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
}
