import { useEffect, useMemo, useRef, useState } from 'react';

interface ColumnFilterHeaderProps {
  label: string;
  /**
   * この列に現れる値の一覧(表示順、重複なし)。関数を渡すとポップオーバーを開いた時だけ計算する
   * (要望: 全件表示でも重くならないように。閉じている間は全行を走査しない)
   */
  options: string[] | (() => string[]);
  /** 現在選択中の値集合。null/undefinedは「絞り込みなし(全件表示)」を意味する */
  selected: Set<string> | null;
  onChange: (selected: Set<string> | null) => void;
  /**
   * 絞り込み内検索の現在のテキストを呼び出し側で保持したい場合に指定する(省略時はこのコンポーネント内だけの
   * ローカルstateになり、ポップオーバーを開き直すたびにリセットされる=従来どおりの挙動)。
   * 指定した場合、検索テキストは開閉に関わらず保持され、呼び出し側で「チェックが入っている or 検索に
   * ヒットした値」を行フィルタの条件として使えるようになる(要望: 絞り込み内検索を一覧にも反映)。
   */
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
}

/**
 * Googleスプレッドシートのような列単位の絞り込みUI(セクション追加要望)。
 * フィルター状態は呼び出し側のReact stateにのみ保持し、サーバーや他ユーザーには一切共有しない
 * (「そのフィルターは他のユーザー画面には共有されず自分の画面のみ変更で」という要望を満たすため)。
 */
export function ColumnFilterHeader({
  label,
  options: optionsProp,
  selected,
  onChange,
  searchText: searchTextProp,
  onSearchTextChange,
}: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  // searchText/onSearchTextChangeが指定された場合のみ「呼び出し側で状態保持する検索」として扱う
  const controlled = searchTextProp !== undefined && onSearchTextChange !== undefined;
  const searchText = controlled ? searchTextProp : localSearch;
  const setSearchText = controlled ? onSearchTextChange : setLocalSearch;
  const active = selected != null || (controlled && searchText !== '');

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // 呼び出し側で検索テキストを保持しない(=従来仕様の)ページでは、開き直すたびに検索欄をリセットする
  useEffect(() => {
    if (!controlled && open) setLocalSearch('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const options = useMemo(
    () => (open ? (typeof optionsProp === 'function' ? optionsProp() : optionsProp) : []),
    // 関数の場合は開いた時点の一覧で固定(関数は毎レンダー新しくなるため依存に入れない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, typeof optionsProp === 'function' ? null : optionsProp],
  );
  const filteredOptions = options.filter((o) => o.toLowerCase().includes(searchText.toLowerCase()));
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
          className="popover"
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
            fontWeight: 400,
            fontSize: 12,
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--color-border)' }}>
            <input
              autoFocus
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder={controlled ? '検索(ヒットした行を一覧に表示)' : '検索'}
              style={{ width: '100%', fontSize: 12, padding: '4px 6px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '6px 8px', borderBottom: '1px solid var(--color-border)' }}>
            <button
              type="button"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => {
                onChange(null);
                setSearchText('');
              }}
            >
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
