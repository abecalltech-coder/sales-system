import { IsArray, IsUUID } from 'class-validator';

/** 一覧の手動並び替え。表示順に並べたID配列を受け取り manualOrder を振り直す(要望)。 */
export class ReorderDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}
