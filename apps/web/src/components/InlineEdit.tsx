import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  isoToDateInput,
  isoToDateKey,
  isoToTimeInput,
  parseDateText as parseFlexDateText,
  parseTimeText as parseFlexTimeText,
} from '../lib/dateInput';
import { pastel, readableTextColor } from '../lib/color';

const baseStyle: CSSProperties = {
  border: 'none',
  outline: 'none',
  boxShadow: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  width: '100%',
  padding: 0,
};

/**
 * 一覧セルをその場で書き換える部品。フォーカス時はセルいっぱいに textarea を敷き、
 * 枠(ポップアップ)を出さず「セルの中で編集している」見た目にする(要望)。
 * expand 指定(備考等)のときだけ、下方向に広げて全文を表示する。
 * Enterで確定、Shift+Enterで改行。
 */
export function InlineText({
  value,
  onSave,
  placeholder,
  style,
  disabled,
  expand,
}: {
  value: string | null | undefined;
  onSave: (next: string) => void;
  placeholder?: string;
  style?: CSSProperties;
  disabled?: boolean;
  /** 長文(備考/アポ詳細)向け。フォーカス時にセル位置から広げて全文を表示・編集する */
  expand?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  // expand時: セルの overflow:hidden を抜けるため position:fixed でセル位置に貼り付ける
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(value ?? ''), [value]);

  const updateRect = () => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width });
  };

  useLayoutEffect(() => {
    if (!focused || !expand) return;
    updateRect();
    const on = () => updateRect();
    window.addEventListener('scroll', on, true);
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on, true);
      window.removeEventListener('resize', on);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, expand]);

  // rect 確定後に textarea 高さを内容に合わせる(初回は rect=null で空振りするため rect も依存に入れる)
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!focused || !expand || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 140), Math.round(window.innerHeight * 0.6))}px`;
  }, [focused, expand, draft, rect]);

  const commit = () => {
    setFocused(false);
    if (draft !== (value ?? '')) onSave(draft);
  };

  const previewText = (value ?? '').replace(/\n/g, ' ');

  return (
    <div
      ref={anchorRef}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) setFocused(true);
      }}
      style={{
        ...baseStyle,
        ...style,
        position: 'relative',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'text',
        minHeight: '1.2em',
      }}
    >
      {previewText || (placeholder && <span style={{ color: 'var(--color-text-faint)' }}>{placeholder}</span>)}
      {focused && (!expand || rect) && (
        <textarea
          ref={textareaRef}
          autoFocus
          value={draft}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            } else if (e.key === 'Escape') {
              setDraft(value ?? '');
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          style={
            expand && rect
              ? {
                  // セルの位置に固定表示し、内容に合わせて下方向へ広げて全文を見せる。
                  // 画面下端で見切れないよう上方向に寄せる
                  position: 'fixed',
                  top: Math.min(rect.top, Math.max(8, window.innerHeight - 240)),
                  left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 380) - 12),
                  width: Math.max(rect.width, 380),
                  minHeight: 140,
                  maxHeight: '60vh',
                  overflowY: 'auto',
                  zIndex: 1000,
                  resize: 'none',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  font: 'inherit',
                  fontSize: 12,
                  color: 'var(--color-text)',
                  lineHeight: 1.55,
                  padding: '4px 8px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                }
              : {
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  zIndex: 30,
                  resize: 'none',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  font: 'inherit',
                  color: 'var(--color-text)',
                  lineHeight: 'inherit',
                  padding: 'inherit',
                  margin: 0,
                  background: 'var(--color-surface)',
                  border: 'none',
                  outline: 'none',
                  borderRadius: 0,
                }
          }
        />
      )}
    </div>
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
  colored,
}: {
  value: string | null | undefined;
  options: { id: string; label: string; color?: string | null }[];
  onSave: (next: string) => void;
  style?: CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  /** 「未選択」の空欄オプションを一覧に出したくない場合(常にいずれかの値を選ばせたい列向け) */
  hideBlankOption?: boolean;
  /** 進捗・NG理由等、選択肢ごとに色を持つ項目向け。選択中の値の色をボタン風の枠・背景に反映する(要望) */
  colored?: boolean;
}) {
  const rawColor = colored ? options.find((o) => o.id === value)?.color : undefined;
  // セル背景は元色を白側に寄せて淡くする(要望: 濃くて見づらい)
  const selectedColor = rawColor ? pastel(rawColor) : undefined;
  // 既知の選択肢に一致しない値(例: Googleフォーム等の外部連携で選択肢外の文言が入った場合)でも
  // 空欄表示にせず、そのままの文言を選べる状態として表示する。
  const hasUnknownValue = !!value && !options.some((o) => o.id === value);
  // 淡いパステル背景なので基本は黒文字。ごく暗い色だけ白にする(readableは淡色化後の色で判定)
  const textColor = colored ? (selectedColor ? readableTextColor(selectedColor) : 'var(--color-text-muted)') : 'inherit';

  return (
    <select
      className={colored ? 'inline-select inline-select-colored' : 'inline-select'}
      value={value ?? ''}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onSave(e.target.value)}
      style={{
        font: 'inherit',
        color: textColor,
        width: '100%',
        backgroundColor: colored ? (selectedColor ?? 'var(--color-bg)') : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        // 淡い背景ではプルダウン矢印(既定は白)も暗くする
        ...(colored && textColor === '#111827'
          ? {
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23111827' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
            }
          : {}),
        ...style,
      }}
    >
      {!hideBlankOption && <option value="">{placeholder ?? '未選択'}</option>}
      {hasUnknownValue && <option value={value as string}>{value}</option>}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * 「次回対応日」等、日付だけを柔軟な書式(8/10・8-10・0810等)で手入力するセル。
 * 値をuseStateで持たずdefaultValueのuncontrolled inputにすると、保存成功後にDOM上の
 * 表示が更新されず入力した生の文字列のまま(例: 0909と打っても9/9に変わらない)に
 * なってしまうため、valueをpropに同期するcontrolled inputにしている。
 */
export function InlineFlexDate({
  iso,
  onSave,
  onInvalid,
  label = '日付',
}: {
  iso: string | null;
  onSave: (nextIso: string | null) => void;
  onInvalid: (message: string) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(isoToDateInput(iso));
  useEffect(() => setDraft(isoToDateInput(iso)), [iso]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const raw = draft.trim();
        const current = isoToDateInput(iso);
        if (raw === current) return;
        if (raw === '') {
          onSave(null);
          return;
        }
        const parsed = parseFlexDateText(raw);
        if (!parsed) {
          onInvalid(`${label}は 8/10・8-10・0810 のような形式で入力してください`);
          setDraft(current);
          return;
        }
        const time = isoToTimeInput(iso) || '00:00';
        onSave(new Date(`${parsed}T${time}`).toISOString());
      }}
      style={baseStyle}
    />
  );
}

/** 「対応時間」等、時刻だけを柔軟な書式(9:05・9：05・0905等)で手入力するセル。InlineFlexDateと同じ理由でcontrolledにしている */
export function InlineFlexTime({
  iso,
  onSave,
  onInvalid,
  label = '時間',
}: {
  iso: string | null;
  onSave: (nextIso: string | null) => void;
  onInvalid: (message: string) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(isoToTimeInput(iso));
  useEffect(() => setDraft(isoToTimeInput(iso)), [iso]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const raw = draft.trim();
        const current = isoToTimeInput(iso);
        if (raw === current) return;
        if (raw === '') {
          onSave(null);
          return;
        }
        const parsed = parseFlexTimeText(raw);
        if (!parsed) {
          onInvalid(`${label}は 9:05・9：05・0905 のような形式で入力してください`);
          setDraft(current);
          return;
        }
        const date = isoToDateKey(iso) || isoToDateKey(new Date().toISOString());
        onSave(new Date(`${date}T${parsed}`).toISOString());
      }}
      style={baseStyle}
    />
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
