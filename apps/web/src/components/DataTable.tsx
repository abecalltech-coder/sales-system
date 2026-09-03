import { CSSProperties, Fragment, MouseEvent as ReactMouseEvent, ReactNode, useCallback, useRef, useState } from 'react';
import { ColumnWidths, useTablePreference } from '../hooks/useTablePreference';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  width?: number;
  /** 見出しセルの表示をカスタムしたい場合(列フィルターアイコンなど)。省略時はlabelをそのまま表示する */
  renderHeader?: () => ReactNode;
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
  /** 列数が多い一覧向けに全体のフォントサイズを縮小したい場合に指定する(既定: 13px) */
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
   * サーバーに保存する(端末をまたいで復元、他アカウントには影響しない)。
   * 画面ごとに一意な文字列を渡す(例: "toss-cases")。
   */
  tableKey?: string;
}

const DEFAULT_COLUMN_WIDTH = 120;
const MIN_COLUMN_WIDTH = 56;

/**
 * 一覧画面共通コンポーネント(セクション31)。検索・フィルターは呼び出し側のQueryパラメータで実装し、
 * このコンポーネントは表示・ページネーション・行クリック・列幅調整を担当する。
 */
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
  fontSize = 12,
  expandedRowId,
  renderExpanded,
  onCellFocus,
  onCellBlur,
  cellCursor,
  tableKey,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resizable = Boolean(tableKey);
  const { widths: savedWidths, saveWidths } = useTablePreference(tableKey ?? '');
  // ドラッグ中の見た目を即時反映するための一時的な上書き(保存はドラッグ完了時)。
  const [draftWidths, setDraftWidths] = useState<ColumnWidths>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const widthOf = (col: Column<T>): number =>
    draftWidths[col.key] ?? savedWidths[col.key] ?? col.width ?? DEFAULT_COLUMN_WIDTH;

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

  // ハンドルのダブルクリックでその列の幅設定をクリアし、初期幅に戻す。
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

  const tableWidth = resizable ? columns.reduce((sum, col) => sum + widthOf(col), 0) : undefined;

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
      <div style={{ overflowX: 'auto' }}>
        <table style={{ fontSize, tableLayout: 'fixed', width: tableWidth }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={{ width: widthOf(col) }} />
            ))}
          </colgroup>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              {columns.map((col, colIdx) => (
                <th
                  key={col.key}
                  style={{
                    position: 'relative',
                    padding: '4px 8px',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: Math.max(fontSize - 1, 10),
                    whiteSpace: 'nowrap',
                    overflow: col.renderHeader ? 'visible' : 'hidden',
                    textOverflow: 'ellipsis',
                    borderRight: colIdx < columns.length - 1 ? '1px solid var(--color-border-subtle)' : undefined,
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
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: 9,
                        height: '100%',
                        cursor: 'col-resize',
                        zIndex: 1,
                      }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                  読み込み中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                  データがありません
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const restingBackground: string = String(rowStyle?.(row)?.background ?? (i % 2 === 1 ? '#fbfbfc' : 'transparent'));
                return (
                <Fragment key={getRowId(row)}>
                <tr
                  onClick={() => onRowClick?.(row)}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background-color 0.1s ease',
                    ...rowStyle?.(row),
                    background: restingBackground,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-primary-soft)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = restingBackground)}
                >
                  {columns.map((col, colIdx) => {
                    const rowId = getRowId(row);
                    const cursor = cellCursor?.(rowId, col.key);
                    return (
                    <td
                      key={col.key}
                      title={cursor ? `${cursor.userName}さんが編集中` : undefined}
                      onFocusCapture={() => onCellFocus?.(rowId, col.key)}
                      onBlurCapture={() => onCellBlur?.(rowId, col.key)}
                      style={{
                        position: 'relative',
                        padding: '3px 8px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        borderRight: colIdx < columns.length - 1 ? '1px solid var(--color-border-subtle)' : undefined,
                        boxShadow: cursor ? `inset 0 0 0 2px ${cursor.color}` : undefined,
                        background: cursor ? `${cursor.color}1a` : undefined,
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
                    <td colSpan={columns.length} style={{ padding: '10px 14px', background: '#fafafa', borderBottom: '1px solid var(--color-border)' }}>
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
