import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  isoToDateInput,
  isoToDateKey,
  isoToTimeInput,
  parseDateText as parseFlexDateText,
  parseTimeText as parseFlexTimeText,
} from '../lib/dateInput';

/** 背景色に対して読みやすい文字色(明るい背景なら黒、暗い背景なら白)を返す */
function readableTextColor(bg: string | null | undefined): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((bg ?? '').trim());
  if (!m) return '#111827';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#111827' : '#ffffff';
}

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
 * 非フォーカス時は他の列と同じ1行の高さに収まる省略表示(行の高さを常に統一するため)、
 * フォーカス時のみGoogleスプレッドシートのように実サイズのtextareaを画面固定位置で
 * セルの上に浮かせて全文を表示する(position:fixedで祖先のoverflow:hiddenによる
 * クリッピングを回避している。単純なabsoluteだと表の列幅で切れてしまうため)。
 * Enterで確定、Shift+EnterまたはCtrl+Enterで改行を挿入できる。
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
  /** 長文(備考/アポ詳細)向け。クリックしたセル位置で広く開き、全文を表示・編集できる */
  expand?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
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
    if (!focused) return;
    updateRect();
    const onScrollOrResize = () => updateRect();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);

  // rect を依存に含めるのが重要: focused=true の初回レンダーではまだ textarea が
  // マウントされておらず(rect が null のため)高さ計算が空振りする。rect 確定後の
  // 再レンダーでこの effect を再実行させることで全文の高さに広げる。
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!focused || !el) return;
    el.style.height = 'auto';
    const min = expand ? 120 : 0;
    el.style.height = `${Math.max(el.scrollHeight, min)}px`;
  }, [focused, draft, rect, expand]);

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
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'text',
        minHeight: '1.2em',
      }}
    >
      {previewText || (placeholder && <span style={{ color: 'var(--color-text-faint)' }}>{placeholder}</span>)}
      {focused && rect && (
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
            // Shift+Enter・Ctrl+Enter・Alt+Enterはデフォルト動作(改行挿入)に任せる
          }}
          style={{
            position: 'fixed',
            top: rect.top - 6,
            left: rect.left - 9,
            width: expand
              ? Math.min(Math.max(rect.width + 48, 460), Math.round(window.innerWidth * 0.7))
              : Math.min(Math.max(rect.width + 48, 220), 440),
            maxHeight: expand ? '65vh' : undefined,
            zIndex: 1000,
            resize: 'none',
            overflowY: expand ? 'auto' : 'hidden',
            overflowX: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            font: 'inherit',
            fontWeight: style?.fontWeight,
            color: 'inherit',
            lineHeight: 1.5,
            padding: '7px 10px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-primary)',
            borderRadius: 10,
            boxShadow: '0 12px 28px rgba(16, 24, 40, 0.16), 0 2px 8px rgba(16, 24, 40, 0.08)',
            animation: 'inline-edit-pop 0.1s ease-out',
          }}
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
  const selectedColor = colored ? options.find((o) => o.id === value)?.color : undefined;
  // 既知の選択肢に一致しない値(例: Googleフォーム等の外部連携で選択肢外の文言が入った場合)でも
  // 空欄表示にせず、そのままの文言を選べる状態として表示する。
  const hasUnknownValue = !!value && !options.some((o) => o.id === value);
  // 明るい背景色(新規=白、見込み=淡黄など)のときは白文字だと読めないので黒にする(要望)
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
        backgroundColor: colored ? (selectedColor ?? 'var(--color-border)') : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
        // 明るい背景ではプルダウン矢印(既定は白)も暗くする
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
