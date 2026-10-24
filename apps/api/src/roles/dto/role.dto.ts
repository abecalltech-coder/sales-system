import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';
import { TASK_VIEW_OPTIONS } from '../role-defs';

export class UpdateRoleDto {
  // null = 制限なし(全タブ表示)に戻す。配列を渡すとそのタブのみ表示。
  @ValidateIf((o) => o.visibleTabs !== null && o.visibleTabs !== undefined)
  @IsArray()
  @IsString({ each: true })
  visibleTabs?: string[] | null;

  // タスクの閲覧範囲(AP / DEPT / ALL)。空配列=自分のみ
  @IsOptional()
  @IsArray()
  @IsIn(TASK_VIEW_OPTIONS, { each: true })
  taskView?: string[];

  // 稼働ルールの作成・編集・削除を許可するか(閲覧は全員)
  @IsOptional()
  @IsBoolean()
  canEditWorkRules?: boolean;
}
