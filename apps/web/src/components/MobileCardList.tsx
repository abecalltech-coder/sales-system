import { CSSProperties, ReactNode, useEffect, useState } from 'react';
import type { Column } from './DataTable';
import { readableTextColor } from '../lib/color';

/**
 * 携帯で一覧を「1件2行」のコンパクト表示にするための設定(要望: 1画面に多くの案件を表示)。
 * 各項目は列の key で指定し、表示文字列は列の copyValue をそのまま使う。
 */
export interface MobileCardConfig<T> {
  /** 1行目の左(太字)。店舗名など */
  title: string;
  /** 1行目の右に出すラベル。進捗・ステータスなど */
  badge?: string;
  /** ラベルの背景色(マスタの色) */
  badgeColor?: (row: T) => string | null | undefined;
  /** 2行目に並べる項目。先頭は濃い文字(日時など)、以降は「見出し 値」で出す */
  meta: string[];
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  config: MobileCardConfig<T>;
  loading?: boolean;
  rowStyle?: (row: T) => CSSProperties | undefined;
  toolbar?: ReactNode;
  /** 以下は表(右クリックメニュー・見出し操作)と同じ機能を携帯でも使えるようにするためのもの */
  onDeleteRows?: (ids: string[]) => void;
  extraRowMenuItems?: { label: (count: number) => string; onClick: (ids: string[]) => void; danger?: boolean }[];
  onReorder?: (orderedIds: string[]) => void;
  onDeleteColumn?: (columnKey: string) => void;
  onReorderColumns?: (orderedKeys: string[]) => void;
}

const text = <T,>(col: Column<T> | undefined, row: T) => (col?.copyValue ? col.copyValue(row) : '');

export function MobileCardList<T>({
  columns,
  rows,
  getRowId,
  config,
  loading,
  rowStyle,
  toolbar,
  onDeleteRows,
  extraRowMenuItems,
  onReorder,
  onDeleteColumn,
  onReorderColumns,
}: Props<T>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const titleCol = byKey.get(config.title);
  const badgeCol = config.badge ? byKey.get(config.badge) : undefined;
  const metaCols = config.meta.map((k) => byKey.get(k)).filter((c): c is Column<T> => !!c);
  // 詳細シートは常に最新の行データ(編集の反映後)を表示する
  const openRow = openId ? rows.find((r) => getRowId(r) === openId) : undefined;
  const editableColumns = columns.filter((c) => !c.locked);
  const hasColumnTools = editableColumns.some((c) => c.renderHeader) || !!onDeleteColumn || !!onReorderColumns;

  const moveRow = (id: string, dir: -1 | 1) => {
    if (!onReorder) return;
    const ids = rows.map(getRowId);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onReorder(ids);
  };
  const moveColumn = (key: string, dir: -1 | 1) => {
    if (!onReorderColumns) return;
    const keys = editableColumns.map((c) => c.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    onReorderColumns(keys);
  };

  return (
    <div>
      {toolbar}
      {hasColumnTools && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
          <button type="button" onClick={() => setColumnsOpen(true)} style={{ fontSize: 11, padding: '2px 10px' }}>
            {onDeleteColumn || onReorderColumns ? '絞り込み・列の操作' : '絞り込み'}
          </button>
        </div>
      )}
      <div className="m-card-list">
        {loading && rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--color-text-faint)' }}>データがありません</div>
        ) : (
          rows.map((row) => {
            const id = getRowId(row);
            const badge = text(badgeCol, row);
            const color = config.badgeColor?.(row) ?? null;
            const metas = metaCols.map((c) => ({ key: c.key, label: c.label, value: text(c, row) })).filter((m) => m.value);
            const rs = rowStyle?.(row);
            return (
              <button key={id} type="button" className="m-card" onClick={() => setOpenId(id)} style={rs?.background ? { background: rs.background } : undefined}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {text(titleCol, row) || '(名称未入力)'}
                  </span>
                  {badge && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10.5,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: color ?? 'var(--color-sunken)',
                        color: color ? readableTextColor(color) : 'var(--color-text-muted)',
                      }}
                    >
                      {badge}
                    </span>
                  )}
                </span>
                <span style={{ display: 'flex', gap: 8, width: '100%', fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {metas.map((m, i) => (
                    <span key={m.key} style={i === 0 ? { color: 'var(--color-text)' } : undefined}>
                      {i === 0 ? m.value : `${m.label} ${m.value}`}
                    </span>
                  ))}
                </span>
              </button>
            );
          })
        )}
      </div>

      {openRow && (
        <DetailSheet
          title={text(titleCol, openRow) || '詳細'}
          onClose={() => setOpenId(null)}
          footer={
            (onReorder || onDeleteRows || (extraRowMenuItems?.length ?? 0) > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {onReorder && (
                  <>
                    <button type="button" onClick={() => moveRow(openId!, -1)} style={{ fontSize: 12, padding: '6px 10px' }}>
                      ↑ 上へ
                    </button>
                    <button type="button" onClick={() => moveRow(openId!, 1)} style={{ fontSize: 12, padding: '6px 10px' }}>
                      ↓ 下へ
                    </button>
                  </>
                )}
                {extraRowMenuItems?.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      item.onClick([openId!]);
                      setOpenId(null);
                    }}
                    style={{ fontSize: 12, padding: '6px 10px', color: item.danger ? 'var(--color-danger)' : undefined }}
                  >
                    {item.label(1)}
                  </button>
                ))}
                {onDeleteRows && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('この行を削除しますか？')) return;
                      onDeleteRows([openId!]);
                      setOpenId(null);
                    }}
                    style={{ fontSize: 12, padding: '6px 10px', marginLeft: 'auto', color: 'var(--color-danger)' }}
                  >
                    削除
                  </button>
                )}
              </div>
            )
          }
        >
          {editableColumns.map((c) => (
              <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-sunken)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{c.label}</span>
                <div style={{ minWidth: 0, fontSize: 13 }}>{c.render(openRow)}</div>
              </div>
            ))}
        </DetailSheet>
      )}

      {columnsOpen && (
        <DetailSheet title="絞り込み・列の操作" onClose={() => setColumnsOpen(false)}>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '6px 0' }}>
            項目名の横のアイコンで絞り込みます。{onReorderColumns ? '↑↓で列の順番を入れ替えます。' : ''}
          </p>
          {editableColumns.map((c, i) => (
            <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 0', borderBottom: '1px solid var(--color-sunken)' }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{c.renderHeader ? c.renderHeader() : c.label}</div>
              {onReorderColumns && (
                <>
                  <button type="button" disabled={i === 0} onClick={() => moveColumn(c.key, -1)} aria-label={`${c.label}を上へ`} style={{ width: 30, height: 30, padding: 0 }}>
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i === editableColumns.length - 1}
                    onClick={() => moveColumn(c.key, 1)}
                    aria-label={`${c.label}を下へ`}
                    style={{ width: 30, height: 30, padding: 0 }}
                  >
                    ↓
                  </button>
                </>
              )}
              {onDeleteColumn && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`列「${c.label}」を削除しますか？`)) onDeleteColumn(c.key);
                  }}
                  style={{ height: 30, padding: '0 8px', fontSize: 11, color: 'var(--color-danger)' }}
                >
                  削除
                </button>
              )}
            </div>
          ))}
        </DetailSheet>
      )}
    </div>
  );
}

/** 下から出る詳細シート。各項目は一覧と同じ編集部品をそのまま使うので、ここで直接編集できる。 */
function DetailSheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400 }}>
      <div onClick={onClose} aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(15, 18, 26, 0.45)' }} />
      <section
        role="dialog"
        aria-label={title}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '88%',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderRadius: '18px 18px 0 0',
          boxShadow: '0 -8px 30px rgba(15, 18, 26, 0.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '7px 0 2px' }}>
          <span style={{ width: 40, height: 5, borderRadius: 3, background: 'var(--color-border-strong)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px 8px', borderBottom: '1px solid var(--color-border)' }}>
          <h2 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 16, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
          <button type="button" onClick={onClose} style={{ height: 34, padding: '0 14px', fontSize: 13 }}>
            閉じる
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 16px' }}>{children}</div>
        {footer && <div style={{ padding: '8px 14px', borderTop: '1px solid var(--color-border)' }}>{footer}</div>}
      </section>
    </div>
  );
}
