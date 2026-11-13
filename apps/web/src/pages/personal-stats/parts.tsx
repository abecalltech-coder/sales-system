/** 個人別数値の共通部品(達成率の色・役職バッジ) */

export const rateOf = (actual: number, goal: number | null) => (goal && goal > 0 ? actual / goal : null);
export const rateColor = (r: number | null) =>
  r == null ? 'var(--color-text-faint)' : r >= 1 ? 'var(--color-success)' : r < 0.7 ? 'var(--color-danger)' : 'var(--color-text)';
export const fmtRate = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

/** 名前の横に出す役職(AP / APリーダー) */
export function RoleBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--color-text-muted)',
        background: 'var(--color-sunken)',
        border: '1px solid var(--color-border)',
        borderRadius: 4,
        padding: '0 5px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/** 切り替えボタン(個人別数値の「表示の切り替え」で共通に使う) */
export function SegButtons<T extends string>({
  options,
  value,
  onChange,
  small,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--color-sunken)', borderRadius: 8, padding: 2, gap: 2 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              height: small ? 24 : 28,
              padding: small ? '0 8px' : '0 12px',
              fontSize: 12,
              fontWeight: on ? 700 : 500,
              border: 'none',
              borderRadius: 6,
              boxShadow: on ? 'var(--shadow-sm)' : 'none',
              background: on ? 'var(--color-surface)' : 'transparent',
              color: on ? (o.color ?? 'var(--color-text)') : 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 率(%)と指標の比較で色を決める: 指標以上は緑、未満は赤、指標が無ければ通常 */
export function benchmarkColors(rate: number | null, benchmark: number | null | undefined) {
  if (rate == null) return { color: 'var(--color-text-faint)', bg: 'transparent' };
  if (benchmark == null) return { color: 'var(--color-text)', bg: 'transparent' };
  return rate * 100 >= benchmark
    ? { color: 'var(--color-success)', bg: 'var(--color-success-soft)' }
    : { color: 'var(--color-danger)', bg: 'var(--color-danger-soft)' };
}

/** 率の表示: 50.0% */
export const fmtPct1 = (rate: number | null) => (rate == null ? '—' : `${(rate * 100).toFixed(1)}%`);
