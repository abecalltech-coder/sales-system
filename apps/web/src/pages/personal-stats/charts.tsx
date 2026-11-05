import { DayGetter, PlanMetric, isCounted, landingOf, planOf } from './apStats';

/**
 * 個人別数値のグラフ(要望)。外部ライブラリは使わず SVG / div で描く。
 * - 累計推移: 日ごとの累計を「実績(実線)」「着地見込み(色付きの点線)」「月初予算(灰色の点線)」で重ねる。実績は今日までの日だけ
 * - 人別の棒: 部署サマリー用。人ごとに 実績 の棒と 予算 の目印を並べる
 * トスは青、アポはオレンジ(表と同じ色)。
 */

const colorOf = (key: PlanMetric['key']) => (key === 'TOSS_UP' ? 'var(--color-primary)' : 'var(--color-appo)');
const softOf = (key: PlanMetric['key']) => (key === 'TOSS_UP' ? 'var(--color-primary-soft)' : 'var(--color-appo-soft)');

/** 日ごとの累計(予算は月初予算。実績は今日までの日だけ。着地見込みは今日まで実績と同じで、明日以降は手入力を足す) */
export function cumulativeSeries(days: string[], today: string, g: DayGetter, m: PlanMetric) {
  let a = 0;
  let p = 0;
  let l = 0;
  return days.map((d) => {
    p += planOf(g, d, m);
    l += landingOf(g, d, m, today);
    const counted = isCounted(d, today);
    if (counted) a += g.value(d, m.key);
    return { date: d, plan: p, landing: l, actual: counted ? a : null };
  });
}

export function CumulativeChart({ days, today, getter, metric, height = 130 }: { days: string[]; today: string; getter: DayGetter; metric: PlanMetric; height?: number }) {
  const color = colorOf(metric.key);
  const series = cumulativeSeries(days, today, getter, metric);
  const n = series.length;
  if (n === 0) return null;

  const W = 300;
  const padL = 26;
  const padR = 8;
  const padT = 8;
  const padB = 18;
  const max = Math.max(1, ...series.map((s) => Math.max(s.plan, s.landing, s.actual ?? 0)));
  const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);

  const planPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.plan).toFixed(1)}`).join(' ');
  const landingPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.landing).toFixed(1)}`).join(' ');
  const counted = series.filter((s) => s.actual != null);
  const actualPath = counted.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.actual!).toFixed(1)}`).join(' ');
  const areaPath =
    counted.length > 0 ? `${actualPath} L${x(counted.length - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z` : '';
  const last = counted[counted.length - 1];
  const dayNo = (d: string) => Number(d.slice(8));
  const ticks = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '6px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
        <b style={{ color }}>{metric.label} 累計推移</b>
        <span style={{ color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="16" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="16" y2="3" style={{ stroke: color, strokeWidth: 2 }} />
            </svg>
            実績
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="16" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="16" y2="3" style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: '2 2' }} />
            </svg>
            着地見込み
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="16" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="16" y2="3" style={{ stroke: 'var(--color-text-muted)', strokeWidth: 1.5, strokeDasharray: '3 2' }} />
            </svg>
            月初予算
          </span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img" aria-label={`${metric.label}の累計推移。実績${last?.actual ?? 0}、着地見込み${series[n - 1].landing}、月初予算${series[n - 1].plan}`} style={{ display: 'block' }}>
        {[0, 0.5, 1].map((r) => (
          <g key={r}>
            <line x1={padL} x2={W - padR} y1={y(max * r)} y2={y(max * r)} style={{ stroke: 'var(--color-border)', strokeWidth: 1 }} />
            <text x={padL - 3} y={y(max * r) + 3} textAnchor="end" fontSize="9" style={{ fill: 'var(--color-text-muted)' }}>
              {Math.round(max * r)}
            </text>
          </g>
        ))}
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={height - 4} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="9" style={{ fill: 'var(--color-text-muted)' }}>
            {dayNo(series[i].date)}日
          </text>
        ))}
        {areaPath && <path d={areaPath} style={{ fill: softOf(metric.key) }} />}
        <path d={planPath} fill="none" style={{ stroke: 'var(--color-text-muted)', strokeWidth: 1.5, strokeDasharray: '4 3' }} />
        {/* 今日までは実績と同じなので実績の線の下に隠れ、明日以降の見込みだけが見える */}
        <path d={landingPath} fill="none" data-line="landing" style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: '2 2' }} />
        {actualPath && <path d={actualPath} fill="none" style={{ stroke: color, strokeWidth: 2 }} />}
        {last && <circle cx={x(counted.length - 1)} cy={y(last.actual!)} r="3" style={{ fill: color }} />}
      </svg>
    </div>
  );
}

export interface MemberBarRow {
  id: string;
  name: string;
  actual: number;
  plan: number;
}

/** 部署サマリー用: 人ごとの 実績(棒)と 予算(縦の目印) */
export function MemberBars({ metric, rows, onOpen }: { metric: PlanMetric; rows: MemberBarRow[]; onOpen: (id: string) => void }) {
  const color = colorOf(metric.key);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual, r.plan)));
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderTop: `3px solid ${color}`, borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
        <b style={{ color }}>{metric.label} 人別(実績と予算)</b>
        <span style={{ color: 'var(--color-text-muted)' }}>縦線 = 予算</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) 56px', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <button
              onClick={() => onOpen(r.id)}
              style={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: 0, textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
            >
              {r.name}
            </button>
            <div style={{ position: 'relative', height: 12, background: 'var(--color-sunken)', borderRadius: 3 }} role="img" aria-label={`${r.name} ${metric.label} 実績${r.actual}、予算${r.plan}`}>
              <div style={{ width: `${(r.actual / max) * 100}%`, height: 12, background: color, borderRadius: 3 }} />
              {r.plan > 0 && <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${(r.plan / max) * 100}%`, width: 2, background: 'var(--color-text)' }} />}
            </div>
            <span style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
              <b style={{ color: 'var(--color-text)' }}>{r.actual}</b>/{r.plan}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
