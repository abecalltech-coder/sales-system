/** 個人別数値の共通部品(達成率の色・数値入力セル) */

export const rateOf = (actual: number, goal: number | null) => (goal && goal > 0 ? actual / goal : null);
export const rateColor = (r: number | null) =>
  r == null ? 'var(--color-text-faint)' : r >= 1 ? 'var(--color-success)' : r < 0.7 ? 'var(--color-danger)' : 'var(--color-text)';
export const fmtRate = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

/** 0以上の整数だけ受け付ける入力欄。空欄は「手入力なし」 */
export function NumberCell({
  value,
  placeholder,
  onChange,
  disabled,
  title,
  width = '100%',
}: {
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  title?: string;
  width?: number | string;
}) {
  return (
    <input
      inputMode="numeric"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      title={title}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 6))}
      onFocus={(e) => e.target.select()}
      style={{
        width,
        height: 22,
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        boxShadow: 'none',
        padding: '0 2px',
        textAlign: 'center',
        fontSize: 12,
        color: 'var(--color-text)',
      }}
    />
  );
}
