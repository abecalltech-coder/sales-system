import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * 一覧の「手動並び替え」モード(要望)。
 * ON のとき rows を manualOrder 昇順で並べ、DataTable に onReorder を渡してドラッグ並び替えを有効にする。
 * モードの ON/OFF は端末に記憶する(サーバーには保存しない)。並び順自体はサーバーの manualOrder に保存。
 */
export function useManualSort(tableKey: string, reorderPath: string, invalidateKey: string) {
  const storageKey = `manualSort:${tableKey}`;
  const [manual, setManual] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const queryClient = useQueryClient();

  const toggle = useCallback(() => {
    setManual((v) => {
      const next = !v;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  }, [storageKey]);

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.post(reorderPath, { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [invalidateKey] }),
  });

  /** manualOrder 昇順(未設定は末尾)で安定ソートした配列を返す。manualモードでないときは入力をそのまま返す。 */
  const applySort = useCallback(
    <T extends { id: string; manualOrder?: number | null }>(rows: T[]): T[] => {
      if (!manual) return rows;
      return [...rows]
        .map((r, i) => ({ r, i }))
        .sort((a, b) => {
          const ao = a.r.manualOrder ?? Number.MAX_SAFE_INTEGER;
          const bo = b.r.manualOrder ?? Number.MAX_SAFE_INTEGER;
          return ao - bo || a.i - b.i;
        })
        .map((x) => x.r);
    },
    [manual],
  );

  return { manual, toggle, applySort, reorder: reorderMutation.mutate };
}
