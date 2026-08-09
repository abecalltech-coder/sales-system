import { CSSProperties, Fragment, ReactNode } from 'react';

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
}

/**
 * 一覧画面共通コンポーネント(セクション31)。検索・フィルターは呼び出し側のQueryパラメータで実装し、
 * このコンポーネントは表示・ページネーション・行クリックのみを担当する。
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
  fontSize = 13,
  expandedRowId,
  renderExpanded,
  onCellFocus,
  onCellBlur,
  cellCursor,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

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
        <table style={{ fontSize, tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: '10px 12px',
                    width: col.width,
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    fontSize: Math.max(fontSize - 1, 10),
                    whiteSpace: 'nowrap',
                    overflow: col.renderHeader ? 'visible' : 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {col.renderHeader ? col.renderHeader() : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-faint)' }}>
                  読み込み中...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-faint)' }}>
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
                  {columns.map((col) => {
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
                        padding: '9px 12px',
                        width: col.width,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
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
                    <td colSpan={columns.length} style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '1px solid var(--color-border)' }}>
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
          padding: '12px 16px',
          fontSize: 13,
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
