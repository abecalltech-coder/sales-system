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
  rowStyle?: (row: T) => CSSProperties | undefined;
  fontSize?: number;
  expandedRowId?: string | null;
  renderExpanded?: (row: T) => ReactNode;
  onCellFocus?: (rowId: string, columnKey: string) => void;
  onCellBlur?: (rowId: string, columnKey: string) => void;
  cellCursor?: (rowId: string, columnKey: string) => { userName: string; color: string } | undefined;
  /** 列幅の保存キー。画面ごとに一意な文字列(例: "toss-cases") */
  tableKey?: string;
  /** 指定すると行をドラッグで並び替えられる(左端の行番号を掴む)。表示順のID配列を返す */
  onReorder?: (orderedIds: string[]) => void;
}

const DEFAULT_COLUMN_WIDTH = 120;
const MIN_COLUMN_WIDTH = 56;
const GUTTER_WIDTH = 34;

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
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((line) => line.split('\t'));
}

type UndoCell = { rowId: string; colKey: string; before: string; after: string };
type UndoOp = { cells: UndoCell[] };

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

  const [sel, setSel] = useState<Sel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const clipboardRef = useRef<string>('');
  const gridRef = useRef<HTMLDivElement>(null);

  // 最新の rows / columns を event ハンドラから参照するための ref
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // ドラッグ選択
  const dragRef = useRef<{ startR: number; startC: number } | null>(null);
  const hoverRef = useRef<{ r: number; c: number } | null>(null);
  const draggingRef = useRef(false);

  // Undo / Redo
  const undoRef = useRef<UndoOp[]>([]);
  const redoRef = useRef<UndoOp[]>([]);
  const pendingEditRef = useRef<{ rowId: string; colKey: string; before: string } | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 1600);
  };

  useEffect(() => {
    setSel(null);
  }, [rows.length]);

  const widthOf = (col: Column<T>): number =>
    draftWidths[col.key] ?? savedWidths[col.key] ?? col.width ?? DEFAULT_COLUMN_WIDTH;

  const findRowById = (id: string) => rowsRef.current.find((r) => getRowId(r) === id);

  // --- Undo/Redo -------------------------------------------------------
  const applyOp = (op: UndoOp, dir: 'undo' | 'redo') => {
    for (const cell of op.cells) {
      const row = findRowById(cell.rowId);
      const col = columnsRef.current.find((c) => c.key === cell.colKey);
      if (row && col?.pasteValue) col.pasteValue(row, dir === 'undo' ? cell.before : cell.after);
    }
  };
  const pushUndo = (cells: UndoCell[]) => {
    const changed = cells.filter((c) => c.before !== c.after);
    if (changed.length === 0) return;
    undoRef.current.push({ cells: changed });
    redoRef.current = [];
  };
  const doUndo = () => {
    const op = undoRef.current.pop();
    if (!op) return;
    applyOp(op, 'undo');
    redoRef.current.push(op);
    flash('元に戻しました');
  };
  const doRedo = () => {
    const op = redoRef.current.pop();
    if (!op) return;
    applyOp(op, 'redo');
    undoRef.current.push(op);
    flash('やり直しました');
  };

  // --- 列幅リサイズ ---------------------------------------------------
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

  // --- コピー / 切り取り / 貼り付け ----------------------------------
  const buildTsv = (s: Sel): string => {
    const b = bounds(s);
    const lines: string[] = [];
    for (let r = b.r0; r <= b.r1 && r < rowsRef.current.length; r++) {
      const cells: string[] = [];
      for (let c = b.c0; c <= b.c1 && c < columnsRef.current.length; c++) {
        cells.push(columnsRef.current[c].copyValue?.(rowsRef.current[r]) ?? '');
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  };

  const snapshotRange = (s: Sel): { rowId: string; colKey: string; before: string }[] => {
    const b = bounds(s);
    const out: { rowId: string; colKey: string; before: string }[] = [];
    for (let r = b.r0; r <= b.r1 && r < rowsRef.current.length; r++) {
      for (let c = b.c0; c <= b.c1 && c < columnsRef.current.length; c++) {
        const col = columnsRef.current[c];
        if (!col.pasteValue) continue;
        out.push({ rowId: getRowId(rowsRef.current[r]), colKey: col.key, before: col.copyValue?.(rowsRef.current[r]) ?? '' });
      }
    }
    return out;
  };

  const doCopy = async (s: Sel) => {
    const tsv = buildTsv(s);
    clipboardRef.current = tsv;
    try {
      await navigator.clipboard.writeText(tsv);
    } catch {
      /* フォールバック */
    }
    flash('コピーしました');
  };

  const doClear = (s: Sel) => {
    const snap = snapshotRange(s);
    for (const cell of snap) {
      const row = findRowById(cell.rowId);
      const col = columnsRef.current.find((c) => c.key === cell.colKey);
      col?.pasteValue?.(row as T, '');
    }
    pushUndo(snap.map((x) => ({ ...x, after: '' })));
  };

  const doCut = async (s: Sel) => {
    await doCopy(s);
    doClear(s);
    flash('切り取りました');
  };

  const doPaste = async (s: Sel) => {
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
    const ops: UndoCell[] = [];
    const cols = columnsRef.current;
    const allRows = rowsRef.current;

    if (single) {
      const v = matrix[0][0];
      for (let r = b.r0; r <= b.r1 && r < allRows.length; r++) {
        for (let c = b.c0; c <= b.c1 && c < cols.length; c++) {
          const col = cols[c];
          if (!col.pasteValue) continue;
          ops.push({ rowId: getRowId(allRows[r]), colKey: col.key, before: col.copyValue?.(allRows[r]) ?? '', after: v });
          col.pasteValue(allRows[r], v);
        }
      }
    } else {
      for (let dr = 0; dr < matrix.length; dr++) {
        const tr = b.r0 + dr;
        if (tr >= allRows.length) break;
        for (let dc = 0; dc < matrix[dr].length; dc++) {
          const tc = b.c0 + dc;
          if (tc >= cols.length) break;
          const col = cols[tc];
          if (!col.pasteValue) continue;
          const v = matrix[dr][dc];
          ops.push({ rowId: getRowId(allRows[tr]), colKey: col.key, before: col.copyValue?.(allRows[tr]) ?? '', after: v });
          col.pasteValue(allRows[tr], v);
        }
      }
      setSel({
        ar: b.r0,
        ac: b.c0,
        fr: Math.min(b.r0 + matrix.length - 1, allRows.length - 1),
        fc: Math.min(b.c0 + Math.max(...matrix.map((m) => m.length)) - 1, cols.length - 1),
      });
    }
    pushUndo(ops);
    flash('貼り付けました');
  };

  // --- グリッドのキーボード ------------------------------------------
  const onGridKeyDown = (e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement;
    const inField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
    const mod = e.ctrlKey || e.metaKey;

    // 入力欄にフォーカスがある時はネイティブ挙動(文字のコピー・元に戻す)に任せる
    if (inField) return;
    if (!sel) return;

    if (mod && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if (mod && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      doRedo();
      return;
    }
    if (mod && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      void doCopy(sel);
      return;
    }
    if (mod && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      void doCut(sel);
      return;
    }
    if (mod && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      void doPaste(sel);
      return;
    }
    if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      setSel({ ar: 0, ac: 0, fr: rowsRef.current.length - 1, fc: columnsRef.current.length - 1 });
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      doClear(sel);
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
        const fr = Math.max(0, Math.min(rowsRef.current.length - 1, s.fr + dr));
        const fc = Math.max(0, Math.min(columnsRef.current.length - 1, s.fc + dc));
        return e.shiftKey ? { ...s, fr, fc } : { ar: fr, ac: fc, fr, fc };
      });
    };
    if (e.key === 'ArrowUp') move(-1, 0);
    else if (e.key === 'ArrowDown') move(1, 0);
    else if (e.key === 'ArrowLeft') move(0, -1);
    else if (e.key === 'ArrowRight') move(0, 1);
  };

  // --- セル選択のマウス操作 ----------------------------------------
  const onCellMouseDown = (e: ReactMouseEvent, r: number, c: number) => {
    // 右クリックは無視
    if (e.button !== 0) return;
    dragRef.current = { startR: r, startC: c };
    hoverRef.current = { r, c };
    draggingRef.current = false;
    if (e.shiftKey && sel) {
      e.preventDefault();
      setSel({ ...sel, fr: r, fc: c });
    } else {
      setSel({ ar: r, ac: c, fr: r, fc: c });
      // preventDefault しない → 単純クリックなら内側の入力欄がフォーカスされ編集になる
    }
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  };
  const onCellMouseEnter = (r: number, c: number) => {
    hoverRef.current = { r, c };
    if (draggingRef.current) {
      setSel((s) => (s ? { ...s, fr: r, fc: c } : s));
    }
  };
  const onWindowMouseMove = useCallback((e: MouseEvent) => {
    const start = dragRef.current;
    const hover = hoverRef.current;
    if (!start || !hover) return;
    if (!draggingRef.current && (hover.r !== start.startR || hover.c !== start.startC)) {
      // 別セルへドラッグ開始 → 範囲選択モードに入り、開いていた入力欄は閉じる
      draggingRef.current = true;
      (document.activeElement as HTMLElement | null)?.blur();
      gridRef.current?.focus();
      document.body.style.userSelect = 'none';
      setSel((s) => (s ? { ...s, fr: hover.r, fc: hover.c } : s));
    }
    void e;
  }, []);
  const onWindowMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    document.body.style.userSelect = '';
    dragRef.current = null;
    if (draggingRef.current) gridRef.current?.focus();
    draggingRef.current = false;
  }, [onWindowMouseMove]);

  const selectColumn = (c: number) => {
    if (rowsRef.current.length === 0) return;
    gridRef.current?.focus();
    setSel({ ar: 0, ac: c, fr: rowsRef.current.length - 1, fc: c });
  };
  const selectRow = (r: number, extend: boolean) => {
    gridRef.current?.focus();
    setSel((s) =>
      extend && s
        ? { ...s, fr: r, fc: columnsRef.current.length - 1 }
        : { ar: r, ac: 0, fr: r, fc: columnsRef.current.length - 1 },
    );
  };

  // --- 単一セル編集の undo 記録 -----------------------------------
  const handleCellFocus = (rowId: string, colKey: string) => {
    onCellFocus?.(rowId, colKey);
    const col = columnsRef.current.find((x) => x.key === colKey);
    const row = findRowById(rowId);
    if (col?.copyValue && row) pendingEditRef.current = { rowId, colKey, before: col.copyValue(row) };
  };
  const handleCellBlur = (rowId: string, colKey: string) => {
    onCellBlur?.(rowId, colKey);
    // 入力欄を抜けたあと何もフォーカスされていなければ、キーボード操作を続けられるよう
    // グリッドにフォーカスを戻す(Enter / Escape で編集を終えた直後など)
    window.setTimeout(() => {
      if (document.activeElement === document.body) gridRef.current?.focus();
    }, 0);
    const pending = pendingEditRef.current;
    if (!pending || pending.rowId !== rowId || pending.colKey !== colKey) return;
    pendingEditRef.current = null;
    // 保存(react-query invalidate)後に値が反映されるのを少し待ってから差分を記録
    window.setTimeout(() => {
      const col = columnsRef.current.find((x) => x.key === colKey);
      const row = findRowById(rowId);
      if (!col?.copyValue || !row) return;
      const after = col.copyValue(row);
      if (after !== pending.before) pushUndo([{ rowId, colKey, before: pending.before, after }]);
    }, 400);
  };

  // --- 行の並び替え ------------------------------------------------
  const dragRowRef = useRef<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);
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
    const ids = rowsRef.current.map((r) => getRowId(r));
    const [moved] = ids.splice(from, 1);
    ids.splice(index, 0, moved);
    onReorder?.(ids);
  };

  const tableWidth = resizable ? columns.reduce((sum, col) => sum + widthOf(col), 0) + GUTTER_WIDTH : undefined;

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
      {toast && (
        <div
          style={{
            padding: '3px 12px',
            fontSize: 11,
            color: 'var(--color-success)',
            borderBottom: '1px solid var(--color-border)',
            background: '#fafafa',
          }}
        >
          {toast}
        </div>
      )}

      <div ref={gridRef} tabIndex={0} onKeyDown={onGridKeyDown} style={{ overflowX: 'auto', outline: 'none' }}>
        <table style={{ fontSize, tableLayout: 'fixed', width: tableWidth }}>
          <colgroup>
            <col style={{ width: GUTTER_WIDTH }} />
            {columns.map((col) => (
              <col key={col.key} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              <th
                title="行番号(クリックで行選択・ドラッグで範囲)"
                style={{
                  padding: 0,
                  textAlign: 'center',
                  color: 'var(--color-text-faint)',
                  fontWeight: 600,
                  fontSize: 9,
                  borderRight: '1px solid var(--color-border)',
                }}
              >
                #
              </th>
              {columns.map((col, colIdx) => (
                <th
                  key={col.key}
                  onClick={(e) => {
                    // ヘッダー内の操作(フィルターボタン等)以外をクリックしたら列選択
                    if ((e.target as HTMLElement).closest('button')) return;
                    selectColumn(colIdx);
                  }}
                  style={{
                    position: 'relative',
                    padding: '4px 8px',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: Math.max(fontSize - 1, 10),
                    whiteSpace: 'nowrap',
                    overflow: col.renderHeader ? 'visible' : 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'pointer',
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
                <td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                  読み込み中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
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
                      onClick={() => onRowClick?.(row)}
                      onDragOver={reorderable ? (e) => onRowDragOver(e, i) : undefined}
                      onDrop={reorderable ? () => onRowDrop(i) : undefined}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        borderTop: dragOverRow === i ? '2px solid var(--color-primary)' : undefined,
                        ...rowStyle?.(row),
                        background: restingBackground,
                      }}
                    >
                      <td
                        onClick={(e) => selectRow(i, e.shiftKey)}
                        draggable={reorderable}
                        onDragStart={reorderable ? (e) => onRowDragStart(e, i) : undefined}
                        onDragEnd={
                          reorderable
                            ? () => {
                                dragRowRef.current = null;
                                setDragOverRow(null);
                              }
                            : undefined
                        }
                        title={
                          reorderable
                            ? 'ドラッグで並び替え / クリックで行選択(Shiftで範囲)'
                            : 'クリックで行選択(Shiftで範囲)'
                        }
                        style={{
                          textAlign: 'center',
                          fontSize: 9,
                          color: 'var(--color-text-faint)',
                          userSelect: 'none',
                          cursor: reorderable ? 'grab' : 'pointer',
                          borderRight: '1px solid var(--color-border)',
                          background: sel && i >= bounds(sel).r0 && i <= bounds(sel).r1 ? 'var(--color-primary-soft)' : undefined,
                        }}
                      >
                        {i + 1}
                      </td>
                      {columns.map((col, colIdx) => {
                        const rowId = getRowId(row);
                        const cursor = cellCursor?.(rowId, col.key);
                        const selected = sel ? inSel(sel, i, colIdx) : false;
                        const isFocusCell = sel ? sel.fr === i && sel.fc === colIdx : false;
                        return (
                          <td
                            key={col.key}
                            title={cursor ? `${cursor.userName}さんが編集中` : undefined}
                            onFocusCapture={() => handleCellFocus(rowId, col.key)}
                            onBlurCapture={() => handleCellBlur(rowId, col.key)}
                            onMouseDown={(e) => onCellMouseDown(e, i, colIdx)}
                            onMouseEnter={() => onCellMouseEnter(i, colIdx)}
                            style={{
                              position: 'relative',
                              padding: '3px 8px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              ...(colIdx < columns.length - 1 ? COLUMN_SEPARATOR : null),
                              boxShadow: isFocusCell
                                ? 'inset 0 0 0 2px var(--color-primary)'
                                : selected
                                  ? 'inset 0 0 0 1px var(--color-primary)'
                                  : cursor
                                    ? `inset 0 0 0 2px ${cursor.color}`
                                    : undefined,
                              backgroundColor:
                                selected && !isFocusCell
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
                            {col.render(row)}
                          </td>
                        );
                      })}
                    </tr>
                    {renderExpanded && getRowId(row) === expandedRowId && (
                      <tr>
                        <td
                          colSpan={columns.length + 1}
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
