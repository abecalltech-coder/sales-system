import {
  CSSProperties,
  DragEvent as ReactDragEvent,
  Fragment,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ColumnWidths, useTablePreference } from '../hooks/useTablePreference';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  width?: number;
  /** 見出しセルの表示をカスタムしたい場合(列フィルターアイコンなど)。省略時はlabelをそのまま表示する */
  renderHeader?: () => ReactNode;
  /** コピー時にこのセルが返すテキスト。未指定の列はコピー時に空文字扱い */
  copyValue?: (row: T) => string;
  /** 貼り付け時にこのセルへ値を書き込む。未指定の列は貼り付け不可(読み取り専用) */
  pasteValue?: (row: T, text: string) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onRowClick?: (row: T) => void;
  getRowId: (row: T) => string;
  /** 行ごとの背景色などを上書きしたい場合に指定する(例: 対応中フラグの赤色表示) */
  rowStyle?: (row: T) => CSSProperties | undefined;
  /** 列数が多い一覧向けに全体のフォントサイズを縮小したい場合に指定する(既定: 10px) */
  fontSize?: number;
  /** 展開中の行ID。指定した行の直下にrenderExpandedの内容をアコーディオン表示する */
  expandedRowId?: string | null;
  /** 展開時に表示する内容(コメント欄など、一覧の列にできない情報用) */
  renderExpanded?: (row: T) => ReactNode;
  /** セル内の入力欄にフォーカスした時に呼ばれる(他ユーザーへのカーソル位置共有用) */
  onCellFocus?: (rowId: string, columnKey: string) => void;
  /** セル内の入力欄からフォーカスが外れた時に呼ばれる */
  onCellBlur?: (rowId: string, columnKey: string) => void;
  /** 他ユーザーが今フォーカスしているセルの表示情報を返す(未フォーカスならundefined) */
  cellCursor?: (rowId: string, columnKey: string) => { userName: string; color: string } | undefined;
  /**
   * 指定すると列幅をドラッグで変更でき、その幅をログインユーザー本人の設定として
   * サーバーに保存する。画面ごとに一意な文字列を渡す(例: "toss-cases")。
   * 「選択・コピーモード」のON/OFFもこのキーで端末に記憶する。
   */
  tableKey?: string;
  /** 指定すると選択・コピーモード中に行をドラッグで並び替えられる。表示順のID配列を返す */
  onReorder?: (orderedIds: string[]) => void;
}

const DEFAULT_COLUMN_WIDTH = 120;
const MIN_COLUMN_WIDTH = 56;
const GUTTER_WIDTH = 22;

const COLUMN_SEPARATOR: CSSProperties = {
  backgroundImage: 'linear-gradient(to bottom, var(--color-border-strong) 45%, transparent 45%)',
  backgroundPosition: 'top right',
  backgroundSize: '1px 4px',
  backgroundRepeat: 'repeat-y',
};

type Sel = { ar: number; ac: number; fr: number; fc: number };
const bounds = (s: Sel) => ({
  r0: Math.min(s.ar, s.fr),
  r1: Math.max(s.ar, s.fr),
  c0: Math.min(s.ac, s.fc),
  c1: Math.max(s.ac, s.fc),
});
const inSel = (s: Sel, r: number, c: number) => {
  const b = bounds(s);
  return r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1;
};

/** クリップボードのTSVを2次元配列に分解する(末尾の空行は無視) */
function parseClipboard(text: string): string[][] {
  const rows = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  return rows.map((line) => line.split('\t'));
}

export function DataTable<T>({
  columns,
  rows,
  total,
  page,
  pageSize,
  loading,
  onPageChange,
  onRowClick,
  getRowId,
  rowStyle,
  fontSize = 10,
  expandedRowId,
  renderExpanded,
  onCellFocus,
  onCellBlur,
  cellCursor,
  tableKey,
  onReorder,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resizable = Boolean(tableKey);
  const { widths: savedWidths, saveWidths } = useTablePreference(tableKey ?? '');
  const [draftWidths, setDraftWidths] = useState<ColumnWidths>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // --- 選択・コピーモード ---------------------------------------------------
  const modeKey = tableKey ? `dt.selectMode:${tableKey}` : '';
  const [selectMode, setSelectMode] = useState(() => {
    try {
      return modeKey ? localStorage.getItem(modeKey) === '1' : false;
    } catch {
      return false;
    }
  });
  const toggleSelectMode = () => {
    setSelectMode((v) => {
      const next = !v;
      try {
        if (modeKey) localStorage.setItem(modeKey, next ? '1' : '0');
      } catch {
        /* private mode 等 */
      }
      if (!next) setSel(null);
      return next;
    });
  };

  const [sel, setSel] = useState<Sel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragSelRef = useRef(false);
  const clipboardRef = useRef<string>(''); // navigator.clipboard が使えない場合のフォールバック
  const gridRef = useRef<HTMLDivElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1600);
  };

  useEffect(() => {
    // 行の増減で選択がずれるためクリアする
    setSel(null);
  }, [rows.length]);

  const widthOf = (col: Column<T>): number =>
    draftWidths[col.key] ?? savedWidths[col.key] ?? col.width ?? DEFAULT_COLUMN_WIDTH;

  // --- 列幅リサイズ -------------------------------------------------------
  const onResizeMove = useCallback((e: MouseEvent) => {
    const st = resizingRef.current;
    if (!st) return;
    const next = Math.max(MIN_COLUMN_WIDTH, Math.round(st.startWidth + (e.clientX - st.startX)));
    setDraftWidths((d) => ({ ...d, [st.key]: next }));
  }, []);

  const onResizeEnd = useCallback(() => {
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const st = resizingRef.current;
    resizingRef.current = null;
    if (!st) return;
    setDraftWidths((d) => {
      const finalWidth = d[st.key];
      if (finalWidth != null) saveWidths({ ...savedWidths, ...d, [st.key]: finalWidth });
      return d;
    });
  }, [onResizeMove, saveWidths, savedWidths]);

  const onResizeStart = (e: ReactMouseEvent, col: Column<T>) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key: col.key, startX: e.clientX, startWidth: widthOf(col) };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const resetColumn = (col: Column<T>) => {
    const nextSaved = { ...savedWidths };
    delete nextSaved[col.key];
    setDraftWidths((d) => {
      const n = { ...d };
      delete n[col.key];
      return n;
    });
    saveWidths(nextSaved);
  };

  // --- コピー / 切り取り / 貼り付け --------------------------------------
  const buildTsv = useCallback(
    (s: Sel): string => {
      const b = bounds(s);
      const lines: string[] = [];
      for (let r = b.r0; r <= b.r1 && r < rows.length; r++) {
        const cells: string[] = [];
        for (let c = b.c0; c <= b.c1 && c < columns.length; c++) {
          cells.push(columns[c].copyValue?.(rows[r]) ?? '');
        }
        lines.push(cells.join('\t'));
      }
      return lines.join('\n');
    },
    [rows, columns],
  );

  const doCopy = useCallback(
    async (s: Sel) => {
      const tsv = buildTsv(s);
      clipboardRef.current = tsv;
      try {
        await navigator.clipboard.writeText(tsv);
      } catch {
        /* フォールバックの clipboardRef を使う */
      }
      flash('コピーしました');
    },
    [buildTsv],
  );

  const clearCells = useCallback(
    (s: Sel) => {
      const b = bounds(s);
      for (let r = b.r0; r <= b.r1 && r < rows.length; r++) {
        for (let c = b.c0; c <= b.c1 && c < columns.length; c++) {
          columns[c].pasteValue?.(rows[r], '');
        }
      }
    },
    [rows, columns],
  );

  const doCut = useCallback(
    async (s: Sel) => {
      await doCopy(s);
      clearCells(s);
      flash('切り取りました');
    },
    [doCopy, clearCells],
  );

  const doPaste = useCallback(
    async (s: Sel) => {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = clipboardRef.current;
      }
      if (!text) return;
      const matrix = parseClipboard(text);
      const b = bounds(s);
      const single = matrix.length === 1 && matrix[0].length === 1;
      if (single) {
        const v = matrix[0][0];
        for (let r = b.r0; r <= b.r1 && r < rows.length; r++) {
          for (let c = b.c0; c <= b.c1 && c < columns.length; c++) {
            columns[c].pasteValue?.(rows[r], v);
          }
        }
      } else {
        for (let dr = 0; dr < matrix.length; dr++) {
          const tr = b.r0 + dr;
          if (tr >= rows.length) break;
          for (let dc = 0; dc < matrix[dr].length; dc++) {
            const tc = b.c0 + dc;
            if (tc >= columns.length) break;
            columns[tc].pasteValue?.(rows[tr], matrix[dr][dc]);
          }
        }
        // 貼り付け範囲を選択状態にする
        setSel({
          ar: b.r0,
          ac: b.c0,
          fr: Math.min(b.r0 + matrix.length - 1, rows.length - 1),
          fc: Math.min(b.c0 + Math.max(...matrix.map((m) => m.length)) - 1, columns.length - 1),
        });
      }
      flash('貼り付けました');
    },
    [rows, columns],
  );

  const onGridKeyDown = (e: ReactKeyboardEvent) => {
    if (!selectMode || !sel) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      void doCopy(sel);
      return;
    }
    if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      void doCut(sel);
      return;
    }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      void doPaste(sel);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      clearCells(sel);
      flash('クリアしました');
      return;
    }
    if (e.key === 'Escape') {
      setSel(null);
      return;
    }
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      setSel((s) => {
        if (!s) return s;
        const fr = Math.max(0, Math.min(rows.length - 1, s.fr + dr));
        const fc = Math.max(0, Math.min(columns.length - 1, s.fc + dc));
        return e.shiftKey ? { ...s, fr, fc } : { ar: fr, ac: fc, fr, fc };
      });
    };
    if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowLeft') move(0, -1);
    else if (e.key === 'ArrowRight') move(0, 1);
  };

  // --- セル選択のマウス操作 --------------------------------------------
  const startSel = (e: ReactMouseEvent, r: number, c: number) => {
    if (!selectMode) return;
    e.preventDefault();
    gridRef.current?.focus();
    if (e.shiftKey && sel) {
      setSel({ ...sel, fr: r, fc: c });
    } else {
      setSel({ ar: r, ac: c, fr: r, fc: c });
      dragSelRef.current = true;
    }
  };
  const enterSel = (r: number, c: number) => {
    if (!selectMode || !dragSelRef.current) return;
    setSel((s) => (s ? { ...s, fr: r, fc: c } : s));
  };
  useEffect(() => {
    const up = () => (dragSelRef.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  const selectColumn = (c: number) => {
    if (!selectMode || rows.length === 0) return;
    gridRef.current?.focus();
    setSel({ ar: 0, ac: c, fr: rows.length - 1, fc: c });
  };
  const selectRow = (r: number) => {
    if (!selectMode) return;
    gridRef.current?.focus();
    setSel({ ar: r, ac: 0, fr: r, fc: columns.length - 1 });
  };

  // --- 行の並び替え(ドラッグ) --------------------------------------------
  const dragRowRef = useRef<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);
  // 手動並び替えは呼び出し側が onReorder を渡したとき有効(左端に ⠿ ハンドルを表示)
  const reorderable = Boolean(onReorder);

  const onRowDragStart = (e: ReactDragEvent, index: number) => {
    dragRowRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onRowDragOver = (e: ReactDragEvent, index: number) => {
    if (dragRowRef.current === null) return;
    e.preventDefault();
    setDragOverRow(index);
  };
  const onRowDrop = (index: number) => {
    const from = dragRowRef.current;
    dragRowRef.current = null;
    setDragOverRow(null);
    if (from === null || from === index) return;
    const ids = rows.map((r) => getRowId(r));
    const [moved] = ids.splice(from, 1);
    ids.splice(index, 0, moved);
    onReorder?.(ids);
  };

  const tableWidth = resizable
    ? columns.reduce((sum, col) => sum + widthOf(col), 0) + (reorderable ? GUTTER_WIDTH : 0)
    : undefined;

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {tableKey && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 10px',
            borderBottom: '1px solid var(--color-border)',
            background: '#fafafa',
            fontSize: 11,
          }}
        >
          <button
            onClick={toggleSelectMode}
            className={selectMode ? 'btn-primary' : undefined}
            style={{ fontSize: 11, padding: '3px 10px' }}
          >
            {selectMode ? '✓ 選択・コピー中' : '選択・コピー'}
          </button>
          {selectMode && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              セル/行/列をドラッグ選択 → Ctrl+C コピー / Ctrl+X 切り取り / Ctrl+V 貼り付け / Delete クリア
            </span>
          )}
          {reorderable && !selectMode && (
            <span style={{ color: 'var(--color-text-muted)' }}>左端の ⠿ を掴んで行を並び替えできます</span>
          )}
          {toast && <span style={{ color: 'var(--color-success)', marginLeft: 'auto' }}>{toast}</span>}
        </div>
      )}

      <div style={{ overflowX: 'auto' }} ref={gridRef} tabIndex={selectMode ? 0 : -1} onKeyDown={onGridKeyDown}>
        <table style={{ fontSize, tableLayout: 'fixed', width: tableWidth, userSelect: selectMode ? 'none' : undefined }}>
          <colgroup>
            {reorderable && <col style={{ width: GUTTER_WIDTH }} />}
            {columns.map((col) => (
              <col key={col.key} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              {reorderable && <th style={{ padding: 0 }} />}
              {columns.map((col, colIdx) => (
                <th
                  key={col.key}
                  onClick={() => selectMode && selectColumn(colIdx)}
                  style={{
                    position: 'relative',
                    padding: '4px 8px',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: Math.max(fontSize - 1, 10),
                    whiteSpace: 'nowrap',
                    overflow: col.renderHeader ? 'visible' : 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: selectMode ? 'pointer' : undefined,
                    ...(colIdx < columns.length - 1 ? COLUMN_SEPARATOR : null),
                  }}
                >
                  {col.renderHeader ? col.renderHeader() : col.label}
                  {resizable && (
                    <span
                      role="separator"
                      aria-label={`${col.label}の列幅を変更`}
                      title="ドラッグで列幅変更 / ダブルクリックで既定に戻す"
                      onMouseDown={(e) => onResizeStart(e, col)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        resetColumn(col);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ position: 'absolute', top: 0, right: 0, width: 9, height: '100%', cursor: 'col-resize', zIndex: 1 }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + (reorderable ? 1 : 0)}
                  style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}
                >
                  読み込み中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (reorderable ? 1 : 0)}
                  style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}
                >
                  データがありません
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const restingBackground: string = String(
                  rowStyle?.(row)?.background ?? (i % 2 === 1 ? '#fbfbfc' : 'transparent'),
                );
                return (
                  <Fragment key={getRowId(row)}>
                    <tr
                      onClick={() => !selectMode && onRowClick?.(row)}
                      onDragOver={reorderable ? (e) => onRowDragOver(e, i) : undefined}
                      onDrop={reorderable ? () => onRowDrop(i) : undefined}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        borderTop: dragOverRow === i ? '2px solid var(--color-primary)' : undefined,
                        cursor: onRowClick && !selectMode ? 'pointer' : 'default',
                        ...rowStyle?.(row),
                        background: restingBackground,
                      }}
                    >
                      {reorderable && (
                        <td
                          draggable
                          onDragStart={(e) => onRowDragStart(e, i)}
                          onDragEnd={() => {
                            dragRowRef.current = null;
                            setDragOverRow(null);
                          }}
                          title="ドラッグで並び替え"
                          style={{
                            textAlign: 'center',
                            cursor: 'grab',
                            color: 'var(--color-text-faint)',
                            userSelect: 'none',
                            borderRight: '1px solid var(--color-border)',
                          }}
                        >
                          ⠿
                        </td>
                      )}
                      {columns.map((col, colIdx) => {
                        const rowId = getRowId(row);
                        const cursor = cellCursor?.(rowId, col.key);
                        const selected = selectMode && sel ? inSel(sel, i, colIdx) : false;
                        const isFocusCell = selectMode && sel ? sel.fr === i && sel.fc === colIdx : false;
                        return (
                          <td
                            key={col.key}
                            title={cursor ? `${cursor.userName}さんが編集中` : undefined}
                            onFocusCapture={() => onCellFocus?.(rowId, col.key)}
                            onBlurCapture={() => onCellBlur?.(rowId, col.key)}
                            onMouseDown={selectMode ? (e) => startSel(e, i, colIdx) : undefined}
                            onMouseEnter={selectMode ? () => enterSel(i, colIdx) : undefined}
                            style={{
                              position: 'relative',
                              padding: '3px 8px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              ...(colIdx < columns.length - 1 ? COLUMN_SEPARATOR : null),
                              boxShadow: isFocusCell
                                ? 'inset 0 0 0 2px var(--color-primary)'
                                : cursor
                                  ? `inset 0 0 0 2px ${cursor.color}`
                                  : undefined,
                              backgroundColor: selected
                                ? 'var(--color-primary-soft)'
                                : cursor
                                  ? `${cursor.color}1a`
                                  : undefined,
                            }}
                          >
                            {cursor && (
                              <span
                                aria-hidden
                                style={{
                                  display: 'inline-block',
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: cursor.color,
                                  marginRight: 4,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                            {selectMode ? (
                              <span style={{ pointerEvents: 'none', display: 'block' }}>{col.render(row)}</span>
                            ) : (
                              col.render(row)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {renderExpanded && getRowId(row) === expandedRowId && (
                      <tr>
                        <td
                          colSpan={columns.length + (reorderable ? 1 : 0)}
                          style={{ padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid var(--color-border)' }}
                        >
                          {renderExpanded(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '5px 12px',
          fontSize: 12,
          borderTop: '1px solid var(--color-border)',
          background: '#fafafa',
        }}
      >
        <span style={{ color: 'var(--color-text-muted)' }}>
          全{total.toLocaleString()}件中 {total === 0 ? 0 : (page - 1) * pageSize + 1}〜{Math.min(page * pageSize, total)}件
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ← 前へ
          </button>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            次へ →
          </button>
        </div>
      </div>
    </div>
  );
}
