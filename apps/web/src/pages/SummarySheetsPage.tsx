import { CSSProperties, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { useSummarySheet, useSummarySheets, SummarySheetCell } from '../hooks/useApi';
import { api, ApiError } from '../lib/api';

function buildCellMap(cells: SummarySheetCell[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cells) {
    if (c.value) map.set(`${c.row}:${c.col}`, c.value);
  }
  return map;
}

// スプレッドシートの列見出し風(A, B, ... Z, AA, AB, ...)に変換する
function colLabel(index: number): string {
  let n = index;
  let label = '';
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

const cellStyle: CSSProperties = { border: '1px solid var(--color-border)', padding: 0 };
const headerStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  fontSize: 11,
  color: 'var(--color-text-faint)',
  fontWeight: 600,
  minWidth: 32,
  padding: '2px 4px',
};
const deleteBtnStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#9ca3af',
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: 1,
  padding: 0,
};

export function SummarySheetsPage() {
  const queryClient = useQueryClient();
  const { data: sheets } = useSummarySheets();
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [grid, setGrid] = useState<string[][]>([]);

  useEffect(() => {
    if (!activeId && sheets && sheets.length > 0) setActiveId(sheets[0].id);
  }, [sheets, activeId]);

  const { data: sheet } = useSummarySheet(activeId);

  useEffect(() => {
    if (!sheet) {
      setGrid([]);
      return;
    }
    const map = buildCellMap(sheet.cells);
    const next: string[][] = [];
    for (let r = 0; r < sheet.rowCount; r++) {
      const row: string[] = [];
      for (let c = 0; c < sheet.colCount; c++) row.push(map.get(`${r}:${c}`) ?? '');
      next.push(row);
    }
    setGrid(next);
  }, [sheet]);

  const invalidateSheets = () => queryClient.invalidateQueries({ queryKey: ['summary-sheets'] });
  const invalidateActive = () => queryClient.invalidateQueries({ queryKey: ['summary-sheets', activeId] });

  const createMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>('/summary-sheets', { name: `シート${(sheets?.length ?? 0) + 1}` }),
    onSuccess: (res) => {
      invalidateSheets();
      setActiveId(res.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'シートの作成に失敗しました'),
  });

  const renameMutation = useMutation({
    mutationFn: (vars: { id: string; name: string }) => api.patch(`/summary-sheets/${vars.id}`, { name: vars.name }),
    onSuccess: () => {
      invalidateSheets();
      setRenamingId(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '名称変更に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/summary-sheets/${id}`),
    onSuccess: (_data, id) => {
      invalidateSheets();
      if (activeId === id) setActiveId(undefined);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'シートの削除に失敗しました'),
  });

  const cellMutation = useMutation({
    mutationFn: (vars: { row: number; col: number; value: string }) => api.put(`/summary-sheets/${activeId}/cells`, vars),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'セルの保存に失敗しました'),
  });

  const addRowMutation = useMutation({
    mutationFn: () => api.post(`/summary-sheets/${activeId}/rows`, {}),
    onSuccess: invalidateActive,
    onError: (err) => setError(err instanceof ApiError ? err.message : '行の追加に失敗しました'),
  });

  const removeRowMutation = useMutation({
    mutationFn: (row: number) => api.delete(`/summary-sheets/${activeId}/rows/${row}`),
    onSuccess: invalidateActive,
    onError: (err) => setError(err instanceof ApiError ? err.message : '行の削除に失敗しました'),
  });

  const addColumnMutation = useMutation({
    mutationFn: () => api.post(`/summary-sheets/${activeId}/columns`, {}),
    onSuccess: invalidateActive,
    onError: (err) => setError(err instanceof ApiError ? err.message : '列の追加に失敗しました'),
  });

  const removeColumnMutation = useMutation({
    mutationFn: (col: number) => api.delete(`/summary-sheets/${activeId}/columns/${col}`),
    onSuccess: invalidateActive,
    onError: (err) => setError(err instanceof ApiError ? err.message : '列の削除に失敗しました'),
  });

  function handleCellChange(row: number, col: number, value: string) {
    setGrid((g) => {
      const next = g.map((r) => [...r]);
      next[row][col] = value;
      return next;
    });
  }

  function handleCellBlur(row: number, col: number, value: string) {
    if (!activeId) return;
    cellMutation.mutate({ row, col, value });
  }

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>サマリー</h1>

        {error && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            borderBottom: '1px solid var(--color-border)',
            marginBottom: 16,
            overflowX: 'auto',
          }}
        >
          {sheets?.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {renamingId === s.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => {
                    const v = renameValue.trim();
                    if (v) renameMutation.mutate({ id: s.id, name: v });
                    else setRenamingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  style={{ fontSize: 13, padding: '7px 8px', width: 120 }}
                />
              ) : (
                <button
                  onClick={() => setActiveId(s.id)}
                  onDoubleClick={() => {
                    setRenamingId(s.id);
                    setRenameValue(s.name);
                  }}
                  title="ダブルクリックで名前を変更"
                  style={{
                    padding: '8px 12px',
                    fontSize: 13,
                    border: 'none',
                    borderBottom: activeId === s.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                    background: 'transparent',
                    fontWeight: activeId === s.id ? 700 : 500,
                    color: activeId === s.id ? 'var(--color-primary)' : 'var(--color-text)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name}
                </button>
              )}
              <button
                title="このシートを削除"
                onClick={() => {
                  if (window.confirm(`「${s.name}」を削除しますか？`)) deleteMutation.mutate(s.id);
                }}
                style={{ ...deleteBtnStyle, fontSize: 13, padding: '0 8px 0 0' }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => createMutation.mutate()}
            title="新しいシートを追加"
            style={{ padding: '6px 12px', fontSize: 16, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)' }}
          >
            ＋
          </button>
        </div>

        {!activeId && (
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>
            シートがありません。「＋」から新しいシートを作成してください。
          </p>
        )}

        {activeId && grid.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={headerStyle}></th>
                  {grid[0].map((_, c) => (
                    <th key={c} style={headerStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {colLabel(c)}
                        <button title="この列を削除" onClick={() => removeColumnMutation.mutate(c)} style={deleteBtnStyle}>
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((rowValues, r) => (
                  <tr key={r}>
                    <th style={headerStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {r + 1}
                        <button title="この行を削除" onClick={() => removeRowMutation.mutate(r)} style={deleteBtnStyle}>
                          ×
                        </button>
                      </div>
                    </th>
                    {rowValues.map((value, c) => (
                      <td key={c} style={cellStyle}>
                        <input
                          value={value}
                          onChange={(e) => handleCellChange(r, c, e.target.value)}
                          onBlur={(e) => handleCellBlur(r, c, e.target.value)}
                          style={{ width: 96, border: 'none', padding: '6px 8px', fontSize: 13, outline: 'none' }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => addRowMutation.mutate()} style={{ fontSize: 12, padding: '5px 10px' }}>
                ＋ 行を追加
              </button>
              <button onClick={() => addColumnMutation.mutate()} style={{ fontSize: 12, padding: '5px 10px' }}>
                ＋ 列を追加
              </button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
