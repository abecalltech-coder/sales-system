import { CSSProperties, ReactNode, TouchEvent as ReactTouchEvent, useEffect, useRef, useState } from 'react';
import type { Column } from './DataTable';
import { readableTextColor } from '../lib/color';
import { useCellStyles } from '../hooks/useCellStyles';

const MENU_COLORS = ['#000000', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#92400e', '#ffffff'];

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
  /** セルの文字色・太字(表と共通・全員共有)。tableKey があり cellTextColor のとき有効 */
  tableKey?: string;
  cellTextColor?: boolean;
}

const text = <T,>(col: Column<T> | undefined, row: T) => (col?.copyValue ? col.copyValue(row) : '');
const text_ = text;

/** 長押しメニュー(コピー/切り取り/貼り付け・太字・文字色) */
function FieldMenu({
  x,
  y,
  styles,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onBold,
  onColor,
}: {
  x: number;
  y: number;
  styles: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onBold: () => void;
  onColor: (c: string | null) => void;
}) {
  const run = (f: () => void) => () => {
    f();
    onClose();
  };
  const item: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: 'transparent', fontSize: 13 };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="popover"
        style={{ position: 'fixed', top: Math.max(8, Math.min(y, window.innerHeight - (styles ? 330 : 160))), left: Math.min(x, window.innerWidth - 216), width: 208, padding: 4 }}
      >
        <button type="button" style={item} onClick={run(onCopy)}>
          コピー
        </button>
        <button type="button" style={item} onClick={run(onCut)}>
          切り取り
        </button>
        <button type="button" style={item} onClick={run(onPaste)}>
          貼り付け
        </button>
        {styles && (
          <>
            <div style={{ borderTop: '1px solid var(--color-border)', margin: '4px 0' }} />
            <button type="button" style={item} onClick={run(onBold)}>
              <b>B</b> 太字 / 太字を解除
            </button>
            <div style={{ padding: '4px 12px 2px', fontSize: 11, color: 'var(--color-text-muted)' }}>文字色</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 26px)', gap: 5, padding: '2px 12px 6px' }}>
              {MENU_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={run(() => onColor(c))}
                  style={{ width: 26, height: 26, padding: 0, borderRadius: 5, border: '1px solid var(--color-border-strong)', background: c }}
                />
              ))}
            </div>
            <button type="button" style={item} onClick={run(() => onColor(null))}>
              文字色を解除
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
  tableKey,
  cellTextColor,
}: Props<T>) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  // 詳細シートの項目を長押ししたときのメニュー(要望: コピー/切り取り/貼り付け・文字色・太字)
  const [fieldMenu, setFieldMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const stylesEnabled = Boolean(tableKey && cellTextColor);
  const cellStyles = useCellStyles(stylesEnabled ? tableKey! : '');
  const pressTimer = useRef<number | undefined>(undefined);
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 1500);
  };
  const pressHandlers = (key: string) => ({
    onTouchStart: (e: ReactTouchEvent) => {
      const t = e.touches[0];
      window.clearTimeout(pressTimer.current);
      if (!t) return;
      const x = t.clientX;
      const y = t.clientY;
      pressTimer.current = window.setTimeout(() => setFieldMenu({ key, x, y }), 500);
    },
    onTouchMove: () => window.clearTimeout(pressTimer.current),
    onTouchEnd: () => window.clearTimeout(pressTimer.current),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setFieldMenu({ key, x: e.clientX, y: e.clientY });
    },
  });
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
          {editableColumns.map((c) => {
            const st = stylesEnabled ? cellStyles.styleOf(openId!, c.key) : undefined;
            return (
              <div
                key={c.key}
                {...pressHandlers(c.key)}
                style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--color-sunken)' }}
              >
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', WebkitTouchCallout: 'none', userSelect: 'none' }}>{c.label}</span>
                <div
                  style={{
                    minWidth: 0,
                    fontSize: 13,
                    ...(st?.textColor ? ({ color: st.textColor, '--cell-text-color': st.textColor } as CSSProperties) : null),
                    ...(st?.bold ? ({ fontWeight: 900, '--cell-font-weight': 900 } as CSSProperties) : null),
                  }}
                >
                  {c.render(openRow)}
                </div>
              </div>
            );
          })}
          <p style={{ fontSize: 10, color: 'var(--color-text-faint)', margin: '8px 0 0' }}>項目を長押しすると、コピー・貼り付け・文字色・太字のメニューが出ます。</p>
        </DetailSheet>
      )}

      {fieldMenu && openRow && (
        <FieldMenu
          x={fieldMenu.x}
          y={fieldMenu.y}
          styles={stylesEnabled}
          onClose={() => setFieldMenu(null)}
          onCopy={async () => {
            const col = byKey.get(fieldMenu.key);
            const text = text_(col, openRow);
            try {
              await navigator.clipboard.writeText(text);
              flash('コピーしました');
            } catch {
              flash('コピーできませんでした');
            }
          }}
          onCut={async () => {
            const col = byKey.get(fieldMenu.key);
            try {
              await navigator.clipboard.writeText(text_(col, openRow));
            } catch {
              flash('コピーできませんでした');
              return;
            }
            col?.pasteValue?.(openRow, '');
            flash('切り取りました');
          }}
          onPaste={async () => {
            const col = byKey.get(fieldMenu.key);
            if (!col?.pasteValue) return flash('この項目には貼り付けできません');
            try {
              const t = await navigator.clipboard.readText();
              col.pasteValue(openRow, t.replace(/\r?\n$/, ''));
              flash('貼り付けました');
            } catch {
              flash('クリップボードを読み取れませんでした');
            }
          }}
          onBold={() => {
            const cur = cellStyles.styleOf(openId!, fieldMenu.key)?.bold;
            cellStyles.setStyle([{ rowId: openId!, columnKey: fieldMenu.key }], { bold: !cur });
          }}
          onColor={(color) => cellStyles.setStyle([{ rowId: openId!, columnKey: fieldMenu.key }], { textColor: color })}
        />
      )}
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 90, transform: 'translateX(-50%)', zIndex: 3100, background: 'rgba(25,28,34,0.88)', color: '#fff', fontSize: 12, padding: '6px 12px', borderRadius: 8 }}>
          {toast}
        </div>
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
