import { useCallback, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { getSocket } from '../lib/useRealtimeSync';

interface CellStyleRow {
  rowId: string;
  columnKey: string;
  textColor: string | null;
  bold: boolean;
}

export interface CellRef {
  rowId: string;
  columnKey: string;
}

export interface CellStyle {
  textColor?: string;
  bold?: boolean;
}

type StylePatch = { textColor?: string | null; bold?: boolean };

const cellKey = (rowId: string, columnKey: string) => `${rowId}\u0000${columnKey}`;

/**
 * 一覧のセルごとの書式(文字色・太字。要望: スプレッドシートのように画面上で変える。全員で共有)。
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
    const m = new Map<string, CellStyle>();
    for (const r of query.data ?? []) {
      m.set(cellKey(r.rowId, r.columnKey), { textColor: r.textColor ?? undefined, bold: r.bold || undefined });
    }
    return m;
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (vars: { cells: CellRef[]; patch: StylePatch }) => api.put('/cell-styles', { tableKey, cells: vars.cells, ...vars.patch }),
    onMutate: async ({ cells, patch }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CellStyleRow[]>(queryKey);
      const byKey = new Map((previous ?? []).map((r) => [cellKey(r.rowId, r.columnKey), r]));
      for (const c of cells) {
        const k = cellKey(c.rowId, c.columnKey);
        const cur = byKey.get(k) ?? { ...c, textColor: null, bold: false };
        const next = {
          ...cur,
          ...(patch.textColor !== undefined ? { textColor: patch.textColor } : {}),
          ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
        };
        if (!next.textColor && !next.bold) byKey.delete(k);
        else byKey.set(k, next);
      }
      queryClient.setQueryData<CellStyleRow[]>(queryKey, [...byKey.values()]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
  });

  const styleOf = useCallback((rowId: string, columnKey: string) => map.get(cellKey(rowId, columnKey)), [map]);

  return {
    styleOf,
    setStyle: (cells: CellRef[], patch: StylePatch) => {
      if (cells.length > 0) mutation.mutate({ cells, patch });
    },
  };
}
