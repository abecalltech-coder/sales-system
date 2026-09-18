import {
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  Fragment,
  KeyboardEvent as ReactKeyboardEvent,
  memo,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  TouchEvent as ReactTouchEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ColumnWidths, useTablePreference } from '../hooks/useTablePreference';
import { useHiddenRows } from '../hooks/useHiddenRows';

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
  /** trueの場合、列の削除・ドラッグ並び替えの対象外にする(例: 「+列を追加」ボタン列) */
  locked?: boolean;
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
  /** 列幅・非表示行の保存キー。画面ごとに一意な文字列(例: "toss-cases") */
  tableKey?: string;
  /** 指定すると行をドラッグで並び替えられる(左端の行番号を掴む)。表示順のID配列を返す */
  onReorder?: (orderedIds: string[]) => void;
  /** 指定すると右クリックメニューに「選択行を削除」が出る */
  onDeleteRows?: (ids: string[]) => void;
  /** 指定すると列見出しをドラッグで並び替えられる(要望: 行と同様に列も)。表示順のcolumnKey配列を返す */
  onReorderColumns?: (orderedKeys: string[]) => void;
  /** 指定すると列見出しの右クリックメニューに「この列を削除」が出る(要望: 行と同様に列も削除できるように) */
  onDeleteColumn?: (columnKey: string) => void;
  /** 右クリックメニューへ追加する任意の操作(選択行に対して実行) */
  extraRowMenuItems?: { label: (count: number) => string; onClick: (ids: string[]) => void; danger?: boolean }[];
  /** 合計行など。<tr> をそのまま渡す(セル数は 行番号ガター + columns.length に合わせる) */
  footerRow?: ReactNode;
}

const DEFAULT_COLUMN_WIDTH = 120;
const MIN_COLUMN_WIDTH = 56;
const GUTTER_WIDTH = 34;
const EMPTY_IDS: string[] = [];

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
type SelBounds = { r0: number; r1: number; c0: number; c1: number };

interface RowProps<T> {
  row: T;
  index: number;
  rowId: string;
  columns: Column<T>[];
  rowStyle?: (row: T) => CSSProperties | undefined;
  onRowClick?: (row: T) => void;
  cellCursor?: (rowId: string, columnKey: string) => { userName: string; color: string } | undefined;
  reorderable: boolean;
  isDragOver: boolean;
  focusRow: number | undefined;
  focusCol: number | undefined;
  selBounds: SelBounds | null;
  expandedRowId?: string | null;
  renderExpanded?: (row: T) => ReactNode;
  onRowDragStart: (e: ReactDragEvent, index: number) => void;
  onRowDragOver: (e: ReactDragEvent, index: number) => void;
  onRowDrop: (index: number) => void;
  onRowDragEnd: () => void;
  onSelectRow: (index: number, extend: boolean) => void;
  onCellContextMenu: (e: ReactMouseEvent, index: number) => void;
  onCellMouseDown: (e: ReactMouseEvent, r: number, c: number) => void;
  onCellMouseEnter: (r: number, c: number) => void;
  onCellFocus: (rowId: string, colKey: string) => void;
  onCellBlur: (rowId: string, colKey: string) => void;
}

/**
 * 一覧の1行分をReact.memo化したコンポーネント(要望: スクロール時に全行が再レンダリングされ
 * 重い問題の軽減)。propsが前回と同じ参照/値であればReactが再レンダリングをスキップするため、
 * スクロールだけ(=DataTable本体の再レンダリング)では影響を受けない行は描画コストがかからない。
 */
function RowInner<T>({
  row,
  index: i,
  rowId,
  columns,
  rowStyle,
  onRowClick,
  cellCursor,
  reorderable,
  isDragOver,
  focusRow,
  focusCol,
  selBounds,
  expandedRowId,
  renderExpanded,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
  onSelectRow,
  onCellContextMenu,
  onCellMouseDown,
  onCellMouseEnter,
  onCellFocus,
  onCellBlur,
}: RowProps<T>) {
  const restingBackground: string = String(
    rowStyle?.(row)?.background ?? (i % 2 === 1 ? 'var(--color-sunken)' : 'transparent'),
  );
  // 固定表示(sticky)セルは他列がスクロールして裏に隠れる際も不透明でないと
  // 文字が透けて重なって見えるため、transparentの代わりに不透明な地の色を使う(要望対応の副修正)
  const stickyBackground = i % 2 === 1 ? 'var(--color-sunken)' : 'var(--color-surface)';
  return (
    <Fragment>
      <tr
        onClick={() => onRowClick?.(row)}
        onDragOver={reorderable ? (e) => onRowDragOver(e, i) : undefined}
        onDrop={reorderable ? () => onRowDrop(i) : undefined}
        style={{
          borderBottom: '1px solid var(--color-border)',
          borderTop: isDragOver ? '2px solid var(--color-primary)' : undefined,
          ...rowStyle?.(row),
          background: restingBackground,
        }}
      >
        <td
          onClick={(e) => onSelectRow(i, e.shiftKey)}
          onContextMenu={(e) => onCellContextMenu(e, i)}
          draggable={reorderable}
          onDragStart={reorderable ? (e) => onRowDragStart(e, i) : undefined}
          onDragEnd={reorderable ? onRowDragEnd : undefined}
          title={reorderable ? 'ドラッグで並び替え / クリックで行選択(Shiftで範囲)' : 'クリックで行選択(Shiftで範囲)'}
          style={{
            position: 'sticky',
            left: 0,
            zIndex: 1,
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--color-text-faint)',
            userSelect: 'none',
            cursor: reorderable ? 'grab' : 'pointer',
            borderRight: '1px solid var(--color-border)',
            background:
              selBounds && i >= selBounds.r0 && i <= selBounds.r1 ? 'var(--color-primary-soft)' : stickyBackground,
          }}
        >
          {i + 1}
        </td>
        {columns.map((col, colIdx) => {
          const cursor = cellCursor?.(rowId, col.key);
          const selected = selBounds
            ? i >= selBounds.r0 && i <= selBounds.r1 && colIdx >= selBounds.c0 && colIdx <= selBounds.c1
            : false;
          const isFocusCell = focusRow === i && focusCol === colIdx;
          // 複数選択時は範囲の外周のみ線を引き、セル同士の内側の罫線は出さない(要望)
          const edgeBounds = selected ? selBounds : null;
          const selEdgeShadow = edgeBounds
            ? [
                i === edgeBounds.r0 ? 'inset 0 1px 0 0 var(--color-primary)' : null,
                i === edgeBounds.r1 ? 'inset 0 -1px 0 0 var(--color-primary)' : null,
                colIdx === edgeBounds.c0 ? 'inset 1px 0 0 0 var(--color-primary)' : null,
                colIdx === edgeBounds.c1 ? 'inset -1px 0 0 0 var(--color-primary)' : null,
              ]
                .filter(Boolean)
                .join(', ') || undefined
            : undefined;
          return (
            <td
              key={col.key}
              title={cursor ? `${cursor.userName}さんが編集中` : undefined}
              onFocusCapture={() => onCellFocus(rowId, col.key)}
              onBlurCapture={() => onCellBlur(rowId, col.key)}
              onMouseDown={(e) => onCellMouseDown(e, i, colIdx)}
              onMouseEnter={() => onCellMouseEnter(i, colIdx)}
              onContextMenu={(e) => onCellContextMenu(e, i)}
              style={{
                position: colIdx === 0 ? 'sticky' : 'relative',
                left: colIdx === 0 ? GUTTER_WIDTH : undefined,
                zIndex: colIdx === 0 ? 1 : undefined,
                padding: '3px 8px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                borderRight: colIdx === 0 ? '1px solid var(--color-border)' : undefined,
                ...(colIdx < columns.length - 1 ? COLUMN_SEPARATOR : null),
                boxShadow: isFocusCell
                  ? 'inset 0 0 0 2px var(--color-primary)'
                  : selected
                    ? selEdgeShadow
                    : cursor
                      ? `inset 0 0 0 2px ${cursor.color}`
                      : undefined,
                backgroundColor:
                  selected && !isFocusCell
                    ? 'var(--color-primary-soft)'
                    : cursor
                      ? `${cursor.color}1a`
                      : colIdx === 0
                        ? stickyBackground
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
      {renderExpanded && rowId === expandedRowId && (
        <tr>
          <td
            colSpan={columns.length + 1}
            style={{ padding: '10px 14px', background: 'var(--color-subtle)', borderBottom: '1px solid var(--color-border)' }}
          >
            {renderExpanded(row)}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
const Row = memo(RowInner) as typeof RowInner;

interface TableHeadProps<T> {
  columns: Column<T>[];
  fontSize: number;
  resizable: boolean;
  colReorderable: boolean;
  dragOverCol: number | null;
  onColDragStart: (e: ReactDragEvent, index: number) => void;
  onColDragOver: (e: ReactDragEvent, index: number) => void;
  onColDrop: (index: number) => void;
  onColDragEnd: () => void;
  onColContextMenu: (e: ReactMouseEvent, col: Column<T>) => void;
  onSelectColumn: (index: number) => void;
  onResizeStart: (e: ReactMouseEvent, col: Column<T>) => void;
  onResizeTouchStart: (e: ReactTouchEvent, col: Column<T>) => void;
  onResetColumn: (col: Column<T>) => void;
}

/**
 * 見出し行をReact.memo化したコンポーネント(要望: PCでもスクロールが重い問題の軽減)。
 * 見出しは列幅リサイズ・並び替え以外では内容が変わらないため、スクロール由来の
 * DataTable本体の再レンダリングでは(propsが同じ参照のままなら)再レンダリングされない。
 */
function TableHeadInner<T>({
  columns,
  fontSize,
  resizable,
  colReorderable,
  dragOverCol,
  onColDragStart,
  onColDragOver,
  onColDrop,
  onColDragEnd,
  onColContextMenu,
  onSelectColumn,
  onResizeStart,
  onResizeTouchStart,
  onResetColumn,
}: TableHeadProps<T>) {
  return (
    <thead>
      <tr style={{ background: 'var(--color-subtle)', borderBottom: '1px solid var(--color-border-strong)', textAlign: 'left' }}>
        <th
          title="行番号(クリックで行選択・ドラッグで範囲)"
          style={{
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 4,
            padding: 0,
            textAlign: 'center',
            color: 'var(--color-text-faint)',
            fontWeight: 600,
            fontSize: 10,
            background: 'var(--color-subtle)',
            borderRight: '1px solid var(--color-border)',
            borderBottom: '1px solid var(--color-border-strong)',
          }}
        >
          #
        </th>
        {columns.map((col, colIdx) => (
          <th
            key={col.key}
            draggable={colReorderable && !col.locked}
            onDragStart={colReorderable && !col.locked ? (e) => onColDragStart(e, colIdx) : undefined}
            onDragOver={colReorderable ? (e) => onColDragOver(e, colIdx) : undefined}
            onDrop={colReorderable ? () => onColDrop(colIdx) : undefined}
            onDragEnd={colReorderable ? onColDragEnd : undefined}
            onContextMenu={(e) => onColContextMenu(e, col)}
            onClick={(e) => {
              // ヘッダー内の操作(フィルターボタン等)以外をクリックしたら列選択
              if ((e.target as HTMLElement).closest('button')) return;
              onSelectColumn(colIdx);
            }}
            title={colReorderable && !col.locked ? 'ドラッグで列の並び替え / 右クリックで列メニュー' : undefined}
            style={{
              position: 'sticky',
              top: 0,
              left: colIdx === 0 ? GUTTER_WIDTH : undefined,
              zIndex: colIdx === 0 ? 3 : 2,
              padding: '4px 8px',
              color: 'var(--color-text-muted)',
              fontWeight: 700,
              letterSpacing: '0.01em',
              fontSize: Math.max(fontSize - 1, 10),
              whiteSpace: 'nowrap',
              overflow: col.renderHeader ? 'visible' : 'hidden',
              textOverflow: 'ellipsis',
              cursor: colReorderable && !col.locked ? 'grab' : 'pointer',
              background: 'var(--color-subtle)',
              borderBottom: '1px solid var(--color-border-strong)',
              borderRight: colIdx === 0 ? '1px solid var(--color-border)' : undefined,
              borderLeft: dragOverCol === colIdx ? '2px solid var(--color-primary)' : undefined,
              ...(colIdx < columns.length - 1 ? COLUMN_SEPARATOR : null),
            }}
          >
            {col.renderHeader ? col.renderHeader() : col.label}
            {resizable && (
              <span
                role="separator"
                aria-label={`${col.label}の列幅を変更`}
                title="ドラッグで列幅変更 / ダブルクリックで既定に戻す"
                draggable={false}
                onMouseDown={(e) => onResizeStart(e, col)}
                onTouchStart={(e) => onResizeTouchStart(e, col)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onResetColumn(col);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 14,
                  height: '100%',
                  cursor: 'col-resize',
                  zIndex: 1,
                  touchAction: 'none',
                }}
              />
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}
const TableHead = memo(TableHeadInner) as typeof TableHeadInner;

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
  onDeleteRows,
  onReorderColumns,
  onDeleteColumn,
  extraRowMenuItems,
  footerRow,
}: DataTableProps<T>) {
  const resizable = Boolean(tableKey);
  const { widths: savedWidths, saveWidths } = useTablePreference(tableKey ?? '');
  const [draftWidths, setDraftWidths] = useState<ColumnWidths>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  // 非表示行(Google Sheets の行非表示相当。端末ごとに記憶)
  const { hidden, hide, unhide, unhideAll } = useHiddenRows(tableKey ?? '_');
  const allRows = rows;
  // スクロールのたびに再フィルタしないよう(モバイルでのカクつき対策)メモ化する
  const rows2 = useMemo(
    () => (hidden.size ? allRows.filter((r) => !hidden.has(getRowId(r))) : allRows),
    [allRows, hidden, getRowId],
  );
  const hiddenCount = allRows.length - rows2.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [sel, setSel] = useState<Sel | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const clipboardRef = useRef<string>('');
  const gridRef = useRef<HTMLDivElement>(null);

  // 最新の rows(表示中) / columns / sel を event ハンドラから参照するための ref
  const rowsRef = useRef(rows2);
  rowsRef.current = rows2;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const selRef = useRef(sel);
  selRef.current = sel;
  // Row を React.memo 化するため、頻繁に変わるprops(関数)はrefで最新値だけ保持し、
  // ハンドラ自体の参照はuseCallbackで固定する(スクロールだけでは行が再レンダリングされないように)
  const onCellFocusRef = useRef(onCellFocus);
  onCellFocusRef.current = onCellFocus;
  const onCellBlurRef = useRef(onCellBlur);
  onCellBlurRef.current = onCellBlur;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const getRowIdRef = useRef(getRowId);
  getRowIdRef.current = getRowId;
  // 見出し行(TableHead)も同様にReact.memo化するための ref ミラー
  const onReorderColumnsRef = useRef(onReorderColumns);
  onReorderColumnsRef.current = onReorderColumns;
  const onDeleteColumnRef = useRef(onDeleteColumn);
  onDeleteColumnRef.current = onDeleteColumn;
  const draftWidthsRef = useRef(draftWidths);
  draftWidthsRef.current = draftWidths;
  const savedWidthsRef = useRef(savedWidths);
  savedWidthsRef.current = savedWidths;

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
  }, [rows2.length]);

  // --- 行の仮想化(要望: 件数が数千〜数万件になっても軽く保つ) ---------
  // content-visibility等の描画スキップだけでは、React自体が全行分の要素を毎回
  // 生成・差分計算するコストが残るため、実際に画面付近にある行だけをtbodyへ
  // レンダリングし、その前後は高さだけ合わせたダミー行で埋める。
  const ROW_HEIGHT = fontSize + 18; // 1行分の高さ(padding+行送りの概算)。行はほぼ一定高さという前提。
  const ROW_OVERSCAN = 8; // 画面のすぐ外側にも少し多めに描画し、スクロール時のちらつきを防ぐ
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onGridScroll = () => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      setScrollTop(gridRef.current?.scrollTop ?? 0);
    });
  };

  const rowWindowStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - ROW_OVERSCAN);
  const rowWindowCount = Math.ceil(viewportHeight / ROW_HEIGHT) + ROW_OVERSCAN * 2;
  const rowWindowEnd = Math.min(rows2.length, rowWindowStart + rowWindowCount);

  // 矢印キー/Tab等で選択セルが描画範囲の外へ移動したら、その行が見えるようスクロールを合わせる
  // (仮想化により範囲外の行はそもそもDOMに存在しないため、選択だけ移動して見えなくなるのを防ぐ)
  useEffect(() => {
    if (!sel || !gridRef.current) return;
    const el = gridRef.current;
    const rowTop = sel.fr * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    if (rowTop < el.scrollTop) {
      el.scrollTop = rowTop;
    } else if (rowBottom > el.scrollTop + el.clientHeight) {
      el.scrollTop = rowBottom - el.clientHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.fr]);

  // Tabキーでのセル移動(要望)。セルの編集を終えた直後は一瞬 document.body にフォーカスが
  // 移る(blur→再フォーカスの間)ため、gridRef経由のバブリングに頼るonKeyDownだけでは
  // そのタイミングでTabを取りこぼす。window直下でcapture登録し、フォーカスがグリッド内部
  // またはbody(=編集直後の遷移中)のときだけ割り込むことで、常にセル移動として機能させる。
  useEffect(() => {
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const s = selRef.current;
      if (!s) return;
      const active = document.activeElement as HTMLElement | null;
      const insideGrid = !!active && !!gridRef.current?.contains(active);
      const isBody = active === document.body;
      if (!insideGrid && !isBody) return;
      e.preventDefault();
      if (active && active !== gridRef.current) active.blur();
      const dc = e.shiftKey ? -1 : 1;
      setSel((cur) => {
        if (!cur) return cur;
        const fc = Math.max(0, Math.min(columnsRef.current.length - 1, cur.fc + dc));
        return { ar: cur.fr, ac: fc, fr: cur.fr, fc };
      });
      window.setTimeout(() => gridRef.current?.focus({ preventScroll: true }), 0);
    };
    window.addEventListener('keydown', handleTab, true);
    return () => window.removeEventListener('keydown', handleTab, true);
  }, []);

  const widthOf = (col: Column<T>): number =>
    draftWidths[col.key] ?? savedWidths[col.key] ?? col.width ?? DEFAULT_COLUMN_WIDTH;
  const widthOfRef = useRef(widthOf);
  widthOfRef.current = widthOf;

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

  // --- 列幅リサイズ(要望: PC・スマホどちらでも列幅を変更できるように) --------
  const applyResizeMove = useCallback((clientX: number) => {
    const st = resizingRef.current;
    if (!st) return;
    const next = Math.max(MIN_COLUMN_WIDTH, Math.round(st.startWidth + (clientX - st.startX)));
    setDraftWidths((d) => ({ ...d, [st.key]: next }));
  }, []);
  const onResizeMove = useCallback((e: MouseEvent) => applyResizeMove(e.clientX), [applyResizeMove]);
  // スマホはドラッグ操作がtouchイベントで来るため、マウスと同じ計算をtouchmoveでも行う。
  // ハンドル上でのタッチはグリッドの横/縦スクロールに奪われないようpreventDefaultする。
  const onResizeTouchMove = useCallback(
    (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      applyResizeMove(t.clientX);
    },
    [applyResizeMove],
  );
  const onResizeEnd = useCallback(() => {
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    window.removeEventListener('touchmove', onResizeTouchMove);
    window.removeEventListener('touchend', onResizeEnd);
    window.removeEventListener('touchcancel', onResizeEnd);
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
  }, [onResizeMove, onResizeTouchMove, saveWidths, savedWidths]);
  // onResizeStart/onResizeTouchStartはTableHead(React.memo)へpropsとして渡すため参照を固定したいが、
  // onResizeEnd自体はsavedWidths変化のたびに参照が変わる。refで最新のonResizeEndを都度参照することで
  // 「呼び出しは固定・中身は最新」を両立する(要望: スクロールだけでは見出し行が再レンダリングされないように)
  const onResizeEndRef = useRef(onResizeEnd);
  onResizeEndRef.current = onResizeEnd;
  const onResizeStart = useCallback((e: ReactMouseEvent, col: Column<T>) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key: col.key, startX: e.clientX, startWidth: widthOfRef.current(col) };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEndRef.current);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onResizeTouchStart = useCallback((e: ReactTouchEvent, col: Column<T>) => {
    const t = e.touches[0];
    if (!t) return;
    e.stopPropagation();
    resizingRef.current = { key: col.key, startX: t.clientX, startWidth: widthOfRef.current(col) };
    window.addEventListener('touchmove', onResizeTouchMove, { passive: false });
    window.addEventListener('touchend', onResizeEndRef.current);
    window.addEventListener('touchcancel', onResizeEndRef.current);
    document.body.style.userSelect = 'none';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const resetColumn = useCallback((col: Column<T>) => {
    const nextSaved = { ...savedWidthsRef.current };
    delete nextSaved[col.key];
    setDraftWidths((d) => {
      const n = { ...d };
      delete n[col.key];
      return n;
    });
    saveWidths(nextSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const doPasteText = (text: string, s: Sel) => {
    if (!text) return;
    const matrix = parseClipboard(text);
    const b = bounds(s);
    const mRows = matrix.length;
    const mCols = Math.max(...matrix.map((m) => m.length));
    // 貼り付け先が複数セル選択されている場合、コピー元より広ければコピー元のパターンを
    // 繰り返して選択範囲全体を埋める(要望: 複数選択していても1セル目にしか反映されない不具合の修正)。
    // 選択が1セルだけ、またはコピー元より小さい場合はコピー元の大きさをそのまま使う。
    const targetRows = Math.max(b.r1 - b.r0 + 1, mRows);
    const targetCols = Math.max(b.c1 - b.c0 + 1, mCols);
    const ops: UndoCell[] = [];
    const cols = columnsRef.current;
    const allRows = rowsRef.current;

    for (let dr = 0; dr < targetRows; dr++) {
      const tr = b.r0 + dr;
      if (tr >= allRows.length) break;
      const srcRow = matrix[dr % mRows];
      for (let dc = 0; dc < targetCols; dc++) {
        const tc = b.c0 + dc;
        if (tc >= cols.length) break;
        const col = cols[tc];
        if (!col.pasteValue) continue;
        const v = srcRow[dc % srcRow.length] ?? '';
        ops.push({ rowId: getRowId(allRows[tr]), colKey: col.key, before: col.copyValue?.(allRows[tr]) ?? '', after: v });
        col.pasteValue(allRows[tr], v);
      }
    }
    setSel({
      ar: b.r0,
      ac: b.c0,
      fr: Math.min(b.r0 + targetRows - 1, allRows.length - 1),
      fc: Math.min(b.c0 + targetCols - 1, cols.length - 1),
    });
    pushUndo(ops);
    flash('貼り付けました');
  };

  const doPaste = async (s: Sel) => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = clipboardRef.current;
    }
    doPasteText(text, s);
  };

  /**
   * プルダウン以外の入力欄(input/textarea)にフォーカスがある状態でCtrl+Vされた場合の
   * ネイティブpasteイベント。単一値の貼り付けは通常のテキスト編集に任せるが、
   * 複数セル分(タブ/改行区切り)のデータが貼り付けられた場合だけ、そのセルを起点に
   * グリッド側の一括貼り付けへ差し替える(要望: 1セル選択のままでも複数セルへ反映されるように)。
   */
  const onContainerPaste = (e: ReactClipboardEvent<HTMLDivElement>) => {
    if (!sel) return;
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA') return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    const normalized = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
    if (!normalized.includes('\t') && !normalized.includes('\n')) return;
    e.preventDefault();
    doPasteText(text, sel);
  };

  // --- グリッドのキーボード ------------------------------------------
  const onGridKeyDown = (e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement;
    const isSelect = t.tagName === 'SELECT';
    const inTextField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
    const mod = e.ctrlKey || e.metaKey;

    // テキスト入力欄はネイティブ挙動(文字のコピー・元に戻す等)に任せる。
    if (inTextField) return;
    if (!sel) return;
    // プルダウン(select)は矢印キーでの選択肢変更などネイティブ動作を残しつつ、
    // コピー/切り取り/貼り付け/クリア/元に戻す/全選択だけはグリッド側で処理する
    // (要望: プルダウンセルもコピー&ペーストに対応させる)
    if (isSelect) {
      const isShortcut =
        (mod && 'zycxva'.includes(e.key.toLowerCase())) || e.key === 'Delete' || e.key === 'Backspace';
      if (!isShortcut) return;
    }

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
  // (Row をReact.memo化しても参照が変わらないよう、sel はstateではなくselRefから読む)
  const onCellMouseDown = useCallback((e: ReactMouseEvent, r: number, c: number) => {
    // 右クリックは無視
    if (e.button !== 0) return;
    dragRef.current = { startR: r, startC: c };
    hoverRef.current = { r, c };
    draggingRef.current = false;
    const curSel = selRef.current;
    if (e.shiftKey && curSel) {
      e.preventDefault();
      setSel({ ...curSel, fr: r, fc: c });
    } else {
      setSel({ ar: r, ac: c, fr: r, fc: c });
      // preventDefault しない → 単純クリックなら内側の入力欄がフォーカスされ編集になる
    }
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onCellMouseEnter = useCallback((r: number, c: number) => {
    hoverRef.current = { r, c };
    if (draggingRef.current) {
      setSel((s) => (s ? { ...s, fr: r, fc: c } : s));
    }
  }, []);
  const onWindowMouseMove = useCallback((e: MouseEvent) => {
    const start = dragRef.current;
    const hover = hoverRef.current;
    if (!start || !hover) return;
    if (!draggingRef.current && (hover.r !== start.startR || hover.c !== start.startC)) {
      // 別セルへドラッグ開始 → 範囲選択モードに入り、開いていた入力欄は閉じる
      draggingRef.current = true;
      (document.activeElement as HTMLElement | null)?.blur();
      gridRef.current?.focus({ preventScroll: true });
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
    if (draggingRef.current) gridRef.current?.focus({ preventScroll: true });
    draggingRef.current = false;
  }, [onWindowMouseMove]);

  const selectColumn = useCallback((c: number) => {
    if (rowsRef.current.length === 0) return;
    gridRef.current?.focus({ preventScroll: true });
    setSel({ ar: 0, ac: c, fr: rowsRef.current.length - 1, fc: c });
  }, []);
  const selectRow = useCallback((r: number, extend: boolean) => {
    gridRef.current?.focus({ preventScroll: true });
    setSel((s) =>
      extend && s
        ? { ...s, fr: r, fc: columnsRef.current.length - 1 }
        : { ar: r, ac: 0, fr: r, fc: columnsRef.current.length - 1 },
    );
  }, []);

  // --- 右クリックメニュー(行削除・非表示) ------------------------
  const selectedRowIds = (): string[] => {
    if (!sel) return [];
    const b = bounds(sel);
    const ids: string[] = [];
    for (let r = b.r0; r <= b.r1 && r < rowsRef.current.length; r++) ids.push(getRowId(rowsRef.current[r]));
    return ids;
  };
  const onCellContextMenu = useCallback((e: ReactMouseEvent, r: number) => {
    e.preventDefault();
    // 右クリックした行が選択範囲外なら、その行だけを行選択する
    const curSel = selRef.current;
    if (!curSel || !(r >= bounds(curSel).r0 && r <= bounds(curSel).r1)) {
      setSel({ ar: r, ac: 0, fr: r, fc: columnsRef.current.length - 1 });
    }
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  // --- 単一セル編集の undo 記録 -----------------------------------
  const handleCellFocus = useCallback((rowId: string, colKey: string) => {
    onCellFocusRef.current?.(rowId, colKey);
    const col = columnsRef.current.find((x) => x.key === colKey);
    const row = findRowById(rowId);
    if (col?.copyValue && row) pendingEditRef.current = { rowId, colKey, before: col.copyValue(row) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handleCellBlur = useCallback((rowId: string, colKey: string) => {
    onCellBlurRef.current?.(rowId, colKey);
    // 入力欄を抜けたあと何もフォーカスされていなければ、キーボード操作を続けられるよう
    // グリッドにフォーカスを戻す(Enter / Escape で編集を終えた直後など)
    window.setTimeout(() => {
      if (document.activeElement === document.body) gridRef.current?.focus({ preventScroll: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 行の並び替え ------------------------------------------------
  const dragRowRef = useRef<number | null>(null);
  const [dragOverRow, setDragOverRow] = useState<number | null>(null);
  const reorderable = Boolean(onReorder);
  const onRowDragStart = useCallback((e: ReactDragEvent, index: number) => {
    dragRowRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  const onRowDragOver = useCallback((e: ReactDragEvent, index: number) => {
    if (dragRowRef.current === null) return;
    e.preventDefault();
    setDragOverRow(index);
  }, []);
  const onRowDrop = useCallback((index: number) => {
    const from = dragRowRef.current;
    dragRowRef.current = null;
    setDragOverRow(null);
    if (from === null || from === index) return;
    const ids = rowsRef.current.map((r) => getRowIdRef.current(r));
    const [moved] = ids.splice(from, 1);
    ids.splice(index, 0, moved);
    onReorderRef.current?.(ids);
  }, []);
  const onRowDragEnd = useCallback(() => {
    dragRowRef.current = null;
    setDragOverRow(null);
  }, []);

  // --- 列の並び替え・削除(要望: 行と同様に列も) ----------------------
  const dragColRef = useRef<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  const colReorderable = Boolean(onReorderColumns);
  const onColDragStart = useCallback((e: ReactDragEvent, index: number) => {
    dragColRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  const onColDragOver = useCallback((e: ReactDragEvent, index: number) => {
    if (dragColRef.current === null) return;
    e.preventDefault();
    setDragOverCol(index);
  }, []);
  const onColDrop = useCallback((index: number) => {
    const from = dragColRef.current;
    dragColRef.current = null;
    setDragOverCol(null);
    if (from === null || from === index) return;
    const keys = columnsRef.current.map((c) => c.key);
    const [moved] = keys.splice(from, 1);
    keys.splice(index, 0, moved);
    onReorderColumnsRef.current?.(keys);
  }, []);
  const onColDragEnd = useCallback(() => {
    dragColRef.current = null;
    setDragOverCol(null);
  }, []);

  const [colMenu, setColMenu] = useState<{ x: number; y: number; col: Column<T> } | null>(null);
  const onColContextMenu = useCallback((e: ReactMouseEvent, col: Column<T>) => {
    if (!onDeleteColumnRef.current || col.locked) return;
    e.preventDefault();
    e.stopPropagation();
    setColMenu({ x: e.clientX, y: e.clientY, col });
  }, []);
  useEffect(() => {
    if (!colMenu) return;
    const close = () => setColMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [colMenu]);

  const tableWidth = resizable ? columns.reduce((sum, col) => sum + widthOf(col), 0) + GUTTER_WIDTH : undefined;

  // 右クリックメニューを開いている時だけ必要な値なので、開いていない間(=スクロール中含む
  // ほとんどの描画)は計算しない(要望: 表示が重い問題の軽減)
  const menuIds = menu ? selectedRowIds() : EMPTY_IDS;

  // 行数が多いとセルごとに何度もbounds(sel)を呼ぶコストが積み上がるため、描画1回につき1度だけ計算する。
  // selが変わらない限り同じ参照を返すことで、行コンポーネントのReact.memoが効くようにする
  // (要望: スクロール中に全行が再レンダリングされ重い問題の軽減)
  const selBoundsOnce = useMemo(() => (sel ? bounds(sel) : null), [sel]);

  return (
    <div
      onPaste={onContainerPaste}
      style={{
        position: 'relative',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {hiddenCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '3px 12px',
            fontSize: 11,
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-subtle)',
          }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>
            🚫 {hiddenCount}行 非表示中{' '}
            <button onClick={unhideAll} style={{ fontSize: 11, padding: '1px 6px', marginLeft: 2 }}>
              すべて表示
            </button>
          </span>
        </div>
      )}

      {/* コピー/貼り付け等のトースト通知はレイアウトに影響させない浮き出し表示にする
          (要望: ショートカット操作のたびに行・列の位置が少しずれる不具合の修正) */}
      {toast && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 400,
            padding: '3px 12px',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: 'var(--color-success)',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'none',
          }}
        >
          {toast}
        </div>
      )}

      {menu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(menu.y, window.innerHeight - 160),
            left: Math.min(menu.x, window.innerWidth - 200),
            zIndex: 3000,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            minWidth: 184,
            fontSize: 12,
          }}
        >
          <MenuItem
            label={`選択した ${menuIds.length} 行を非表示`}
            onClick={() => {
              hide(menuIds);
              setSel(null);
              setMenu(null);
            }}
          />
          {extraRowMenuItems?.map((item, i) => (
            <MenuItem
              key={i}
              danger={item.danger}
              label={item.label(menuIds.length)}
              onClick={() => {
                item.onClick(menuIds);
                setSel(null);
                setMenu(null);
              }}
            />
          ))}
          {onDeleteRows && (
            <MenuItem
              danger
              label={`選択した ${menuIds.length} 行を削除`}
              onClick={() => {
                if (window.confirm(`${menuIds.length} 行を削除します。よろしいですか？`)) {
                  onDeleteRows(menuIds);
                  setSel(null);
                }
                setMenu(null);
              }}
            />
          )}
          {hiddenCount > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
              <MenuItem
                label={`非表示をすべて解除 (${hiddenCount}行)`}
                onClick={() => {
                  unhideAll();
                  setMenu(null);
                }}
              />
            </>
          )}
        </div>
      )}

      {colMenu && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: Math.min(colMenu.y, window.innerHeight - 100),
            left: Math.min(colMenu.x, window.innerWidth - 200),
            zIndex: 3000,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: 4,
            minWidth: 184,
            fontSize: 12,
          }}
        >
          <MenuItem
            danger
            label={`「${colMenu.col.label}」列を削除`}
            onClick={() => {
              if (window.confirm(`「${colMenu.col.label}」列を削除します。この列のデータも失われます。よろしいですか？`)) {
                onDeleteColumn?.(colMenu.col.key);
                setSel(null);
              }
              setColMenu(null);
            }}
          />
        </div>
      )}

      {/* 見出し行・1列目の固定(sticky)は「実際にスクロールする祖先要素」が必要。
          外側カードのoverflow:hiddenだけでは(自身はスクロールしないため)固定が効かないので、
          このグリッド自身に高さ上限とoverflow-yを持たせて実際のスクロール領域にする(要望対応の修正)。 */}
      <div
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onGridKeyDown}
        onScroll={onGridScroll}
        style={{ overflow: 'auto', maxHeight: 'calc(100vh - 230px)', outline: 'none' }}
      >
        <table style={{ fontSize, tableLayout: 'fixed', width: tableWidth }}>
          <colgroup>
            <col style={{ width: GUTTER_WIDTH }} />
            {columns.map((col) => (
              <col key={col.key} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
          <TableHead
            columns={columns}
            fontSize={fontSize}
            resizable={resizable}
            colReorderable={colReorderable}
            dragOverCol={dragOverCol}
            onColDragStart={onColDragStart}
            onColDragOver={onColDragOver}
            onColDrop={onColDrop}
            onColDragEnd={onColDragEnd}
            onColContextMenu={onColContextMenu}
            onSelectColumn={selectColumn}
            onResizeStart={onResizeStart}
            onResizeTouchStart={onResizeTouchStart}
            onResetColumn={resetColumn}
          />
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                  読み込み中...
                </td>
              </tr>
            ) : rows2.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                  {hiddenCount > 0 ? 'すべての行が非表示です' : 'データがありません'}
                </td>
              </tr>
            ) : (
              <>
                {/* 仮想化: 画面付近の行だけを実際にレンダリングし、前後は高さだけのダミー行で埋める
                    (要望: 件数が数千〜数万件になっても軽く保つ) */}
                {rowWindowStart > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={columns.length + 1} style={{ padding: 0, border: 'none', height: rowWindowStart * ROW_HEIGHT }} />
                  </tr>
                )}
                {rows2.slice(rowWindowStart, rowWindowEnd).map((row, sliceIdx) => {
                  const i = rowWindowStart + sliceIdx;
                  const rowId = getRowId(row);
                  return (
                    <Row
                      key={rowId}
                      row={row}
                      index={i}
                      rowId={rowId}
                      columns={columns}
                      rowStyle={rowStyle}
                      onRowClick={onRowClick}
                      cellCursor={cellCursor}
                      reorderable={reorderable}
                      isDragOver={dragOverRow === i}
                      focusRow={sel?.fr}
                      focusCol={sel?.fc}
                      selBounds={selBoundsOnce}
                      expandedRowId={expandedRowId}
                      renderExpanded={renderExpanded}
                      onRowDragStart={onRowDragStart}
                      onRowDragOver={onRowDragOver}
                      onRowDrop={onRowDrop}
                      onRowDragEnd={onRowDragEnd}
                      onSelectRow={selectRow}
                      onCellContextMenu={onCellContextMenu}
                      onCellMouseDown={onCellMouseDown}
                      onCellMouseEnter={onCellMouseEnter}
                      onCellFocus={handleCellFocus}
                      onCellBlur={handleCellBlur}
                    />
                  );
                })}
                {rowWindowEnd < rows2.length && (
                  <tr aria-hidden="true">
                    <td
                      colSpan={columns.length + 1}
                      style={{ padding: 0, border: 'none', height: (rows2.length - rowWindowEnd) * ROW_HEIGHT }}
                    />
                  </tr>
                )}
              </>
            )}
          </tbody>
          {footerRow && (
            <tfoot>
              <tr
                style={{
                  position: 'sticky',
                  bottom: 0,
                  background: 'var(--color-subtle)',
                  borderTop: '2px solid var(--color-border-strong)',
                  fontWeight: 700,
                }}
              >
                {footerRow}
              </tr>
            </tfoot>
          )}
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
          background: 'var(--color-subtle)',
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

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px',
        border: 'none',
        background: 'transparent',
        borderRadius: 4,
        fontSize: 12,
        cursor: 'pointer',
        color: danger ? 'var(--color-danger)' : 'var(--color-text)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-soft)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {label}
    </button>
  );
}
