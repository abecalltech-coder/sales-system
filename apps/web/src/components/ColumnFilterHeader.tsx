import { useEffect, useRef, useState } from 'react';

interface ColumnFilterHeaderProps {
  label: string;
  /** この列に現れる値の一覧(表示順、重複なし) */
  options: string[];
  /** 現在選択中の値集合。null/undefinedは「絞り込みなし(全件表示)」を意味する */
  selected: Set<string> | null;
  onChange: (selected: Set<string> | null) => void;
}

/**
 * Googleスプレッドシートのような列単位の絞り込みUI(セクション追加要望)。
 * フィルター状態は呼び出し側のReact stateにのみ保持し、サーバーや他ユーザーには一切共有しない
 * (「そのフィルターは他のユーザー画面には共有されず自分の画面のみ変更で」という要望を満たすため)。
 */
export function ColumnFilterHeader({ label, options, selected, onChange }: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const active = selected != null;

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  const filteredOptions = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const checkedSet = selected ?? new Set(options);

  const toggleValue = (value: string) => {
    const next = new Set(checkedSet);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    if (next.size === options.length) onChange(null);
    else onChange(next);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span>{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title="絞り込み"
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: '2px 3px',
          fontSize: 11,
          lineHeight: 1,
          color: active ? 'var(--color-primary)' : 'var(--color-text-faint)',
          fontWeight: active ? 800 : 400,
        }}
      >
        ▼
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            marginTop: 4,
            width: 220,
            maxHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            fontWeight: 400,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--color-border)' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="検索"
              style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
            <button type="button" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => onChange(null)}>
              すべて選択
            </button>
            <button type="button" style={{ fontSize: 11, padding: '2px 6px' }} onClick={() => onChange(new Set())}>
              すべて解除
            </button>
          </div>
          <div style={{ overflowY: 'auto', padding: 6 }}>
            {filteredOptions.length === 0 ? (
              <div style={{ padding: 8, color: 'var(--color-text-faint)' }}>該当なし</div>
            ) : (
              filteredOptions.map((opt) => (
                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checkedSet.has(opt)} onChange={() => toggleValue(opt)} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt || '(空白)'}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
