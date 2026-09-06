import { currentPeriodMonth, formatPeriodMonth, shiftPeriodMonth, usePeriodMonth } from '../lib/usePeriodMonth';

/**
 * 全画面共通の対象月セレクタ。`‹ 2026年9月 ›`。
 * 状態は usePeriodMonth(URL ?month= + localStorage)で共有されるため、
 * どの画面に置いても切り替えが他画面へ伝播する。
 */
export function MonthSwitcher({ compact }: { compact?: boolean }) {
  const [month, setMonth] = usePeriodMonth();
  const isCurrent = month === currentPeriodMonth();

  const btn: React.CSSProperties = {
    width: 22,
    height: 22,
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    lineHeight: 1,
    border: 'none',
    background: 'transparent',
    boxShadow: 'none',
    color: 'var(--color-text-muted)',
    borderRadius: 6,
  };

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        border: '1px solid var(--color-border-strong)',
        borderRadius: 999,
        padding: '2px 4px',
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-xs)',
      }}
    >
      <button style={btn} title="前の月" aria-label="前の月" onClick={() => setMonth(shiftPeriodMonth(month, -1))}>
        ‹
      </button>
      <button
        onClick={() => setMonth(currentPeriodMonth())}
        title={isCurrent ? '当月' : '当月に戻す'}
        style={{
          minWidth: compact ? 62 : 78,
          textAlign: 'center',
          fontSize: 12,
          fontWeight: 700,
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
          color: isCurrent ? 'var(--color-text)' : 'var(--color-primary)',
          padding: '2px 4px',
        }}
      >
        {formatPeriodMonth(month)}
      </button>
      <button style={btn} title="次の月" aria-label="次の月" onClick={() => setMonth(shiftPeriodMonth(month, 1))}>
        ›
      </button>
    </div>
  );
}
