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
}

const text = <T,>(col: Column<T> | undefined, row: T) => (col?.copyValue ? col.copyValue(row) : '');

export function MobileCardList<T>({ columns, rows, getRowId, config, loading, rowStyle, toolbar }: Props<T>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const titleCol = byKey.get(config.title);
  const badgeCol = config.badge ? byKey.get(config.badge) : undefined;
  const metaCols = config.meta.map((k) => byKey.get(k)).filter((c): c is Column<T> => !!c);
  // 詳細シートは常に最新の行データ(編集の反映後)を表示する
  const openRow = openId ? rows.find((r) => getRowId(r) === openId) : undefined;

  return (
    <div>
      {toolbar}
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
        <DetailSheet title={text(titleCol, openRow) || '詳細'} onClose={() => setOpenId(null)}>
          {columns
            .filter((c) => !c.locked)
            .map((c) => (
              <div key={c.key} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-sunken)' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{c.label}</span>
                <div style={{ minWidth: 0, fontSize: 13 }}>{c.render(openRow)}</div>
              </div>
            ))}
        </DetailSheet>
      )}
    </div>
  );
}

/** 下から出る詳細シート。各項目は一覧と同じ編集部品をそのまま使うので、ここで直接編集できる。 */
function DetailSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
      </section>
    </div>
  );
}
