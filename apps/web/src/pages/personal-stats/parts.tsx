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
