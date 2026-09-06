import { IsArray, IsString, Matches, IsUUID } from 'class-validator';

/** ID配列だけを受け取る共通DTO(手動並び替え・一括削除など)。 */
export class BulkIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

/** @deprecated BulkIdsDto を使う。互換のため残置。 */
export class ReorderDto extends BulkIdsDto {}

/** 選択レコードの対象月(periodMonth)を移動する(前月案件の繰越操作)。 */
export class PeriodMoveDto extends BulkIdsDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'periodMonthは"YYYY-MM"形式で指定してください' })
  periodMonth!: string;
}
