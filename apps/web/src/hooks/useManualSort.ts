import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * 一覧の並び替え。既定は各画面の自動ソート。行番号(⠿)をドラッグして並び替えると
 * 自動的に「手動並び」モードになり、以降は manualOrder 昇順で表示する。
 * 「自動並びに戻す」で解除。モードのON/OFFは端末に記憶(サーバーには保存しない)。
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

  const setMode = useCallback(
    (on: boolean) => {
      setManual(on);
      try {
        localStorage.setItem(storageKey, on ? '1' : '0');
      } catch {
        /* private mode */
      }
    },
    [storageKey],
  );

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => api.post(reorderPath, { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [invalidateKey] }),
  });

  const reorder = useCallback(
    (ids: string[]) => {
      setMode(true); // 並び替えたら手動モードに入る
      reorderMutation.mutate(ids);
    },
    [reorderMutation, setMode],
  );

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

  return { manual, applySort, reorder, resetToAuto: () => setMode(false) };
}
