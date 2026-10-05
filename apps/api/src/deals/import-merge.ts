/**
 * 一括投入で既存の案件へ値を入れるときの決まり(要望):
 * 手打ち・システム内で入力した値は絶対に上書きしない。
 * 一括投入で入れてよいのは「空欄」か「前回も一括投入で入った値」の項目だけ。
 *
 * importedKeys = 今の値が一括投入で入ったものである項目。手で編集するとそこから外れる(=保護される)。
 */
export function mergeImported(
  current: Record<string, unknown>,
  importedKeys: string[],
  incoming: Record<string, unknown>,
): { values: Record<string, unknown>; importedKeys: string[]; changed: string[]; protectedKeys: string[] } {
  const values = { ...current };
  const imported = new Set(importedKeys);
  const changed: string[] = [];
  const protectedKeys: string[] = [];
  for (const [k, v] of Object.entries(incoming)) {
    if (isEmpty(v)) continue; // 一括投入の空欄で既存の値を消さない
    const cur = current[k];
    if (isEmpty(cur) || imported.has(k)) {
      if (cur !== v) changed.push(k);
      values[k] = v;
      imported.add(k);
    } else if (cur !== v) {
      protectedKeys.push(k); // 手打ちの値と違う → 守る
    }
  }
  return { values, importedKeys: [...imported], changed, protectedKeys };
}

/** 手で編集した項目は「一括投入の値」から外す(以後は上書きされない) */
export function markManual(importedKeys: string[], editedKeys: string[]): string[] {
  const edited = new Set(editedKeys);
  return importedKeys.filter((k) => !edited.has(k));
}

function isEmpty(v: unknown): boolean {
  return v === '' || v === null || v === undefined;
}
