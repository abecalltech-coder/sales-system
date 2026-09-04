import { IsArray, IsUUID } from 'class-validator';

/** ID配列だけを受け取る共通DTO(手動並び替え・一括削除など)。 */
export class BulkIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

/** @deprecated BulkIdsDto を使う。互換のため残置。 */
export class ReorderDto extends BulkIdsDto {}
