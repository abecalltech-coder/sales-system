import { CSSProperties, useEffect, useState } from 'react';

const baseStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  width: '100%',
  padding: 0,
};

/**
 * 一覧セルをその場で書き換えられるようにする最小限の部品。
 * 見た目は元のテキスト表示にできるだけ近づけ(枠線なし・透明背景)、
 * クリックで行のアコーディオン展開が発火しないようstopPropagationする。
 */
export function InlineText({
  value,
  onSave,
  placeholder,
  style,
  disabled,
}: {
  value: string | null | undefined;
  onSave: (next: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  return (
    <input
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        if (draft !== (value ?? '')) onSave(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value ?? '');
          (e.target as HTMLInputElement).blur();
        }
      }}
      style={{ ...baseStyle, ...style }}
    />
  );
}

export function InlineSelect({
  value,
  options,
  onSave,
  style,
  disabled,
  placeholder,
  hideBlankOption,
}: {
  value: string | null | undefined;
  options: { id: string; label: string }[];
  onSave: (next: string) => void;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  /** 「未選択」の空欄オプションを一覧に出したくない場合(常にいずれかの値を選ばせたい列向け) */
  hideBlankOption?: boolean;
}) {
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onSave(e.target.value)}
      style={{ ...baseStyle, appearance: 'none', cursor: disabled ? 'default' : 'pointer', ...style }}
    >
      {!hideBlankOption && <option value="">{placeholder ?? '未選択'}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function toInputValue(iso: string | null | undefined, type: 'date' | 'datetime-local') {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return type === 'date' ? datePart : `${datePart} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-8-10"のような手入力表記も許容し、YYYY-MM-DDへ正規化する */
function parseDateText(val: string): string | null {
  const m = val.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const mon = Number(m[2]);
  const day = Number(m[3]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** "2026-8-10 9:5"のような手入力表記も許容し、YYYY-MM-DD HH:mmへ正規化する */
function parseDateTimeText(val: string): string | null {
  const m = val.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const mon = Number(m[2]);
  const day = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  if (mon < 1 || mon > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * カレンダー/時計のピッカーUIを使わず、日付・日時を手入力できるようにする部品。
 * type='date'はYYYY-MM-DD、type='datetime-local'はYYYY-MM-DD HH:mm形式で入力する。
 */
export function InlineDate({
  value,
  onSave,
  type = 'date',
  style,
  disabled,
  onInvalid,
}: {
  value: string | null | undefined;
  onSave: (nextIso: string | null) => void;
  type?: 'date' | 'datetime-local';
  style?: CSSProperties;
  disabled?: boolean;
  /** 入力形式が不正な場合に呼ばれる(未指定ならブラウザのタイトルツールチップに任せる) */
  onInvalid?: (message: string) => void;
}) {
  const [draft, setDraft] = useState(toInputValue(value, type));
  useEffect(() => setDraft(toInputValue(value, type)), [value, type]);

  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:MM'}
      value={draft}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const current = toInputValue(value, type);
        if (draft === current) return;
        if (draft.trim() === '') {
          onSave(null);
          return;
        }
        const parsed = type === 'date' ? parseDateText(draft) : parseDateTimeText(draft);
        if (!parsed) {
          onInvalid?.(type === 'date' ? '日付はYYYY-MM-DD形式で入力してください(例: 2026-08-10)' : '日時はYYYY-MM-DD HH:MM形式で入力してください(例: 2026-08-10 14:30)');
          setDraft(current);
          return;
        }
        onSave(new Date(parsed.replace(' ', 'T')).toISOString());
      }}
      style={{ ...baseStyle, ...style }}
    />
  );
}
