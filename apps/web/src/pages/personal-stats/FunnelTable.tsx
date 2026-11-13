import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SegButtons, benchmarkColors, fmtPct1 } from './parts';
import { DayGetter, FUNNEL, FUNNEL_RATE_LABELS, NeedBase, NeedMode, computeFunnel } from './apStats';
import { api, ApiError } from '../../lib/api';
import { useIsPhone } from '../../lib/useIsPhone';

/**
 * 流れ(要望): コール数 → 有効数 → オーナー接触数 → 主旨NG → クロージングNG → トスアップ → アポイント。
 * 各項目は「その段階まで進んだ数」で、率は一つ前に対する割合(自動)。指標は管理者が入力する全員共通の値。
 * 必要件数は、予算(日ごとの月初予算/修正予算)を今の率でさかのぼった件数。
 * PC は項目ごとに1行の表、携帯は項目を縦に並べて矢印で流れが見えるようにする。
 */
export function FunnelTable({
  days,
  today,
  getter,
  benchmarks,
  canEditBenchmarks,
}: {
  days: string[];
  today: string;
  getter: DayGetter;
  benchmarks: (number | null)[];
  canEditBenchmarks: boolean;
}) {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<NeedMode>('day');
  const [base, setBase] = useState<NeedBase>('appo');
  const f = computeFunnel(days, today, getter, mode, base);

  // 指標の入力中の値(保存は入力欄を離れたとき)
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  useEffect(() => setDrafts({}), [benchmarks.join(',')]);
  const benchOf = (i: number) => benchmarks[i] ?? null;
  const saveBenchmark = async (i: number) => {
    const typed = drafts[i];
    if (typed === undefined) return;
    const value = typed.trim() === '' ? null : Number(typed);
    if (value != null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      setDrafts((d) => {
        const { [i]: _, ...rest } = d;
        return rest;
      });
      return;
    }
    if ((benchOf(i) ?? null) === value) return setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => Number(k) !== i)));
    const next = FUNNEL_RATE_LABELS.map((_, k) => (k === i ? value : benchOf(k)));
    try {
      const saved = await api.put<(number | null)[]>('/personal-stats/benchmarks', { values: next });
      queryClient.setQueryData(['personal-stats', 'benchmarks'], saved);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : '保存に失敗しました');
    }
  };

  const benchInput = (i: number, width: number) =>
    canEditBenchmarks ? (
      <input
        type="number"
        step="0.1"
        min={0}
        max={100}
        value={drafts[i] ?? (benchOf(i) == null ? '' : String(benchOf(i)))}
        onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
        onBlur={() => saveBenchmark(i)}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        aria-label={`${FUNNEL_RATE_LABELS[i]}の指標(管理者)`}
        style={{ width, height: 22, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', padding: '0 2px' }}
      />
    ) : (
      <b style={{ color: 'var(--color-accent)' }}>{benchOf(i) == null ? '—' : `${benchOf(i)}%`}</b>
    );

  const toneOf = (i: number) => (i === 5 ? 'var(--color-primary)' : i === 6 ? 'var(--color-appo)' : 'var(--color-text)');
  const topOf = (i: number) => (i === 5 ? 'var(--color-primary)' : i === 6 ? 'var(--color-appo)' : 'var(--color-border-strong)');
  const needText = (i: number) => (f.need[i] == null ? '—' : String(Math.ceil((f.need[i] as number) - 1e-9)));
  const actualOf = (i: number) => (mode === 'day' ? f.refVals[i] : mode === 'cum' ? f.cum[i] : null);
  /** 実績との差(1日・累計のとき)。足りていれば緑、足りなければ赤 */
  const gapOf = (i: number) => {
    const act = actualOf(i);
    if (f.need[i] == null || act == null) return null;
    return act - Math.ceil((f.need[i] as number) - 1e-9);
  };
  const gapText = (i: number) => {
    const g = gapOf(i);
    return g == null ? '' : g >= 0 ? `+${g}` : String(g);
  };
  const gapColor = (i: number) => {
    const g = gapOf(i);
    return g == null ? 'var(--color-text-muted)' : g >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
  };
  const diffOf = (i: number) => {
    const b = i > 0 ? benchOf(i - 1) : null;
    const r = i > 0 ? f.rates[i] : null;
    return r == null || b == null ? null : r * 100 - b;
  };
  const diffText = (i: number) => {
    const d = diffOf(i);
    return d == null ? '' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}pt`;
  };

  const needLabel = mode === 'day' ? '今日の必要' : mode === 'cum' ? '累計の必要' : '残りの必要';
  const baseName = base === 'toss' ? 'トスアップ' : 'アポイント';
  const explain =
    mode === 'day'
      ? `今日の${baseName}予算 ${f.budget}件を取るために、今の率で各項目があと何件必要か`
      : mode === 'cum'
        ? `11/1〜今日の${baseName}予算の合計 ${f.budget}件に届くのに必要だった件数(実績との差つき)`
        : `月予算 ${f.monthPlan}件のうち足りない ${f.budget}件を取るために、今の率で各項目があと何件必要か`;

  const controls = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center' }}>
      <SegButtons
        options={[
          { value: 'day' as NeedMode, label: '1日' },
          { value: 'cum' as NeedMode, label: '今日まで累計' },
          { value: 'rest' as NeedMode, label: '月末まで残り' },
        ]}
        value={mode}
        onChange={setMode}
        small={isPhone}
      />
      <SegButtons
        options={[
          { value: 'toss' as NeedBase, label: 'トス予算から', color: 'var(--color-primary)' },
          { value: 'appo' as NeedBase, label: 'アポ予算から', color: 'var(--color-appo)' },
        ]}
        value={base}
        onChange={setBase}
        small={isPhone}
      />
    </div>
  );

  const frame: React.CSSProperties = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: isPhone ? '8px 10px' : '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 };
  const heading = (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <b style={{ fontSize: 13 }}>月初〜今日の流れ</b>
      {controls}
    </div>
  );
  const note = <div style={{ fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{explain}。各数字は「その段階まで進んだ数」、率は一つ前に対する割合です。</div>;

  // ---- 携帯: 縦に流れる ----
  if (isPhone) {
    return (
      <div style={frame}>
        {heading}
        {note}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
          {FUNNEL.map((s, i) => {
            const c = i > 0 ? benchmarkColors(f.rates[i], benchOf(i - 1)) : null;
            return (
              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                {i > 0 && c && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
                    <span style={{ color: 'var(--color-text-faint)', fontSize: 16, lineHeight: 1 }}>↓</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{FUNNEL_RATE_LABELS[i - 1]}</span>
                    <b style={{ fontSize: 16, color: c.color, background: c.bg, borderRadius: 6, padding: '0 6px' }}>{fmtPct1(f.rates[i])}</b>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>指標</span>
                    {benchInput(i - 1, 52)}
                    {diffOf(i) != null && <b style={{ fontSize: 11, color: (diffOf(i) as number) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{diffText(i)}</b>}
                  </div>
                )}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderLeft: `4px solid ${topOf(i)}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 10px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: toneOf(i) }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.15 }}>{f.cum[i]}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{needLabel}</div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>
                      {needText(i)}
                      <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-muted)' }}> 件</span>
                    </div>
                    {gapOf(i) != null && <div style={{ fontSize: 11, fontWeight: 700, color: gapColor(i) }}>実績との差 {gapText(i)}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- PC: 項目ごとに1行の表 ----
  const border = '1px solid var(--color-border)';
  const th: React.CSSProperties = { fontSize: 11, fontWeight: 700, padding: '4px 8px', borderBottom: border, textAlign: 'right', whiteSpace: 'nowrap', background: 'var(--color-subtle)', color: 'var(--color-text-muted)' };
  const td: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid var(--color-sunken)', textAlign: 'right', whiteSpace: 'nowrap', fontSize: 13 };
  return (
    <div style={frame}>
      {heading}
      {note}
      <div style={{ overflowX: 'auto', border, borderRadius: 'var(--radius-md)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>項目</th>
              <th style={th}>累計</th>
              <th style={th}>率(一つ前に対して)</th>
              <th style={{ ...th, color: 'var(--color-accent)' }}>指標{canEditBenchmarks ? '(管理者が入力)' : ''}</th>
              <th style={th}>指標との差</th>
              <th style={th}>{needLabel}</th>
              <th style={th}>実績との差</th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL.map((s, i) => {
              const c = i > 0 ? benchmarkColors(f.rates[i], benchOf(i - 1)) : null;
              return (
                <tr key={s.key}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700, color: toneOf(i), borderLeft: `4px solid ${topOf(i)}` }}>{s.label}</td>
                  <td style={{ ...td, fontWeight: 700, fontSize: 15 }}>{f.cum[i]}</td>
                  <td style={{ ...td, fontWeight: 700, fontSize: 16, color: c?.color, background: c?.bg }}>{i === 0 ? '—' : fmtPct1(f.rates[i])}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{i > 0 ? benchInput(i - 1, 64) : ''}</td>
                  <td style={{ ...td, fontWeight: 700, color: diffOf(i) == null ? undefined : (diffOf(i) as number) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{diffText(i)}</td>
                  <td style={{ ...td, fontWeight: 700, fontSize: 15 }}>
                    {needText(i)}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--color-text-muted)' }}> 件</span>
                  </td>
                  <td style={{ ...td, fontWeight: 700, color: gapColor(i) }}>{gapText(i)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
