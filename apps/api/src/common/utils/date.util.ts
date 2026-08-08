/**
 * DTOのDateTime系フィールドをPrismaのupdate用データへ変換する。
 * undefined(未指定=そのまま)とnull(明示的にクリア)を区別する必要があるため、
 * 単純な `value ? new Date(value) : undefined` では null送信時にクリアされない不具合が起きる。
 */
export function toDateOrUndefined(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}
