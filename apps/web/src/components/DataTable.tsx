import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  width?: number;
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
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
            {columns.map((col) => (
              <th key={col.key} style={{ padding: '8px 12px', width: col.width, color: '#6b7280' }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                読み込み中...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                データがありません
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={() => onRowClick?.(row)}
                style={{ borderBottom: '1px solid #f3f4f6', cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: '8px 12px' }}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 4px', fontSize: 13 }}>
        <span style={{ color: '#6b7280' }}>
          全{total}件中 {(page - 1) * pageSize + 1}〜{Math.min(page * pageSize, total)}件
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            前へ
          </button>
          <span>
            {page} / {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            次へ
          </button>
        </div>
      </div>
    </div>
  );
}
