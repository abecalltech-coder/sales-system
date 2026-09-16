import { IsArray, IsString, ValidateIf } from 'class-validator';

export class UpdateRoleDto {
  // null = 制限なし(全タブ表示)に戻す。配列を渡すとそのタブのみ表示。
  @ValidateIf((o) => o.visibleTabs !== null && o.visibleTabs !== undefined)
  @IsArray()
  @IsString({ each: true })
  visibleTabs?: string[] | null;
}
