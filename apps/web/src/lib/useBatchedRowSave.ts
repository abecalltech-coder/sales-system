import { useCallback, useRef } from 'react';

/**
 * 同じ行の複数セルへ貼り付け・削除・元に戻す操作をすると、DataTable側は列ごとに
 * pasteValueを同期ループで連続呼び出す。これをそのままセルごとに個別保存すると、
 * 同じ行に対して複数回のPATCHが同時に飛び、バージョン競合(409、更新が反映されない)や
 * 後勝ちでの上書きロスト(サマリー/シフトのように行全体を都度読み直してマージする方式でも
 * 起こりうる)が発生する(要望: 複数選択・プルダウンを含む貼り付けで一部セルが反映されない
 * 不具合の修正)。
 *
 * 同じ行への複数回のsave呼び出しをマイクロタスクの間だけまとめ、行ごとに1回のPATCHへ
 * マージしてから送ることでこれを防ぐ。DataTableの貼り付けループは完全に同期的なので、
 * 同じ行に属するすべてのセルの変更は、最初の呼び出しでスケジュールされたマイクロタスクが
 * 実行される前に(=まとめて)集まる。
 */
export function useBatchedRowSave<Row, Patch>(
  getId: (row: Row) => string,
  flush: (row: Row, mergedPatch: Patch) => void,
  mergePatch: (a: Patch, b: Patch) => Patch = (a, b) => ({ ...a, ...b }) as Patch,
) {
  const pending = useRef(new Map<string, { row: Row; patch: Patch }>());

  return useCallback(
    (row: Row, patch: Patch) => {
      const id = getId(row);
      const existing = pending.current.get(id);
      if (existing) {
        existing.patch = mergePatch(existing.patch, patch);
        return;
      }
      pending.current.set(id, { row, patch });
      queueMicrotask(() => {
        const entry = pending.current.get(id);
        pending.current.delete(id);
        if (entry) flush(entry.row, entry.patch);
      });
    },
    [getId, flush, mergePatch],
  );
}
