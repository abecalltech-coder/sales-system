import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/useRealtimeSync';

interface CellStyleRow {
  rowId: string;
  columnKey: string;
  textColor: string;
}

export interface CellRef {
  rowId: string;
  columnKey: string;
}

const cellKey = (rowId: string, columnKey: string) => `${rowId}\u0000${columnKey}`;

/**
 * 一覧のセルごとの文字色(要望: スプレッドシートのように画面上で文字色を変える。全員で共有)。
 * tableKey が空なら無効。他ユーザーの変更は Socket.IO の cell-styles.updated で再取得する。
 */
export function useCellStyles(tableKey: string) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['cell-styles', tableKey], [tableKey]);

  const query = useQuery({
    queryKey,
    queryFn: () => api.get<CellStyleRow[]>(`/cell-styles?tableKey=${encodeURIComponent(tableKey)}`),
    enabled: Boolean(tableKey),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!tableKey) return;
    const s = getSocket();
    const handler = (e: { tableKey?: string }) => {
      if (e?.tableKey === tableKey) queryClient.invalidateQueries({ queryKey });
    };
    s.on('cell-styles.updated', handler);
    return () => {
      s.off('cell-styles.updated', handler);
    };
  }, [tableKey, queryClient, queryKey]);

  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of query.data ?? []) m.set(cellKey(r.rowId, r.columnKey), r.textColor);
    return m;
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (vars: { cells: CellRef[]; textColor: string | null }) =>
      api.put('/cell-styles', { tableKey, cells: vars.cells, textColor: vars.textColor }),
    onMutate: async ({ cells, textColor }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CellStyleRow[]>(queryKey);
      const targets = new Set(cells.map((c) => cellKey(c.rowId, c.columnKey)));
      const next = (previous ?? []).filter((r) => !targets.has(cellKey(r.rowId, r.columnKey)));
      if (textColor) next.push(...cells.map((c) => ({ ...c, textColor })));
      queryClient.setQueryData<CellStyleRow[]>(queryKey, next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const textColorOf = useCallback((rowId: string, columnKey: string) => map.get(cellKey(rowId, columnKey)), [map]);

  return {
    textColorOf,
    setTextColor: (cells: CellRef[], textColor: string | null) => {
      if (cells.length > 0) mutation.mutate({ cells, textColor });
    },
  };
}
