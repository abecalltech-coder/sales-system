import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useIsPhone } from '../../lib/useIsPhone';
import { fmtRate, rateColor, rateOf } from './parts';
import { todayKeyJst } from './apStats';

/**
 * 部署ストーリー(要望: 部署ごとに、週ごと・月ごとの両方で数字を追うシート。カレンダーの形、数字はすべて手入力)。
 * 月曜始まりの週ごとに 日別の実績 → 週計・週目標・週達成率 → 累計・累計目標(週目標の積み上げ)・累計達成率。
 * 上に月間(月目標・実績・達成率・残り)。入力は 500ms 止まったら自動保存。
 */

const METRICS = [
  { key: 'TOSS_UP', label: 'トスアップ' },
  { key: 'APPOINTMENT', label: 'アポイント' },
  { key: 'MEETING', label: '商談実施' },
  { key: 'CONTRACT_CORP', label: '成約法人' },
  { key: 'JUSETSU_OK', label: '重説OK' },
  { key: 'ET', label: 'ET' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const SAVE_DELAY_MS = 500;

interface StoryData {
  month: string;
  days: string[];
  values: Record<string, { value: number; version: number }>;
}

/** 月曜始まりの週に分ける。月の外の日は null(入力しない空欄) */
function weeksOf(days: string[]): (string | null)[][] {
  if (days.length === 0) return [];
  const [y, m, d] = days[0].split('-').map(Number);
  const lead = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 月曜=0
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function DepartmentStory({ departmentId, departmentName, month }: { departmentId: string; departmentName: string; month: string }) {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const queryKey = ['personal-stats', 'story', departmentId, month];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.get<StoryData>(`/personal-stats/story?departmentId=${encodeURIComponent(departmentId)}&month=${month}`),
  });

  // 入力中の値(保存が終わるまでの表示用)。key = cell
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const timers = useRef<Record<string, number>>({});
  const chains = useRef<Record<string, Promise<void>>>({});
  useEffect(() => setDrafts({}), [departmentId, month]);

  const clearDraft = (cell: string, typed: string) =>
    setDrafts((d) => {
      if (d[cell] !== typed) return d;
      const { [cell]: _, ...rest } = d;
      return rest;
    });

  const setCell = (cell: string, typed: string) => {
    const clean = typed.replace(/[^\d]/g, '');
    setDrafts((d) => ({ ...d, [cell]: clean }));
    const qk = queryKey;
    window.clearTimeout(timers.current[cell]);
    timers.current[cell] = window.setTimeout(() => {
      // 同じセルの保存は順番に(前の保存で増えた version を次で使う)
      chains.current[cell] = (chains.current[cell] ?? Promise.resolve())
        .then(async () => {
          const latest = draftsRef.current[cell] ?? clean;
          const current = queryClient.getQueryData<StoryData>(qk)?.values[cell];
          const value = latest === '' ? null : Number(latest);
          if ((current?.value ?? null) === value) return clearDraft(cell, latest);
          try {
            const saved = await api.put<{ value: number; version: number } | null>('/personal-stats/story', {
              departmentId,
              month,
              cell,
              value,
              version: current?.version ?? null,
            });
            queryClient.setQueryData<StoryData>(qk, (old) => {
              if (!old) return old;
              const values = { ...old.values };
              if (saved) values[cell] = saved;
              else delete values[cell];
              return { ...old, values };
            });
            clearDraft(cell, latest);
          } catch (e) {
            clearDraft(cell, latest);
            alert(e instanceof ApiError ? e.message : '保存に失敗しました');
            queryClient.invalidateQueries({ queryKey: ['personal-stats', 'story'] });
          }
        })
        .catch(() => undefined);
    }, SAVE_DELAY_MS);
  };

  const weeks = useMemo(() => weeksOf(data?.days ?? []), [data?.days]);
  const today = todayKeyJst();

  if (isLoading) return <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>;
  if (error || !data) return <p style={{ fontSize: 13, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>;

  // ---- 値(入力中 > 保存済み) ----
  const text = (cell: string) => drafts[cell] ?? (data.values[cell] ? String(data.values[cell].value) : '');
  const num = (cell: string) => Number(text(cell) || 0);
  const has = (cell: string) => text(cell) !== '';
  const dayCell = (d: string, m: MetricKey) => `d:${d}:${m}`;
  const weekCell = (wi: number, m: MetricKey) => `w:${wi}:${m}`;
  const monthCell = (m: MetricKey) => `m:${m}`;

  const weekSum = (wi: number, m: MetricKey) => weeks[wi].reduce((a, d) => a + (d ? num(dayCell(d, m)) : 0), 0);
  const cumSum = (wi: number, m: MetricKey) => weeks.slice(0, wi + 1).reduce((a, _w, i) => a + weekSum(i, m), 0);
  const weekGoal = (wi: number, m: MetricKey) => (has(weekCell(wi, m)) ? num(weekCell(wi, m)) : null);
  /** 累計目標 = その週までの週目標の合計(週目標が1つも無ければ空) */
  const cumGoal = (wi: number, m: MetricKey) => {
    const goals = weeks.slice(0, wi + 1).map((_w, i) => weekGoal(i, m));
    return goals.some((g) => g != null) ? goals.reduce<number>((a, g) => a + (g ?? 0), 0) : null;
  };
  const monthTotal = (m: MetricKey) => cumSum(weeks.length - 1, m);
  /** 月目標: 入力が無ければ週目標の合計 */
  const monthGoal = (m: MetricKey) => (has(monthCell(m)) ? num(monthCell(m)) : cumGoal(weeks.length - 1, m));

  const cellInput = (cell: string, opts: { placeholder?: string; width?: number; strong?: boolean } = {}) => (
    <input
      inputMode="numeric"
      value={text(cell)}
      placeholder={opts.placeholder}
      onChange={(e) => setCell(cell, e.target.value)}
      style={{
        width: opts.width ?? '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        textAlign: 'right',
        padding: isPhone ? '6px 5px' : '3px 5px',
        fontSize: isPhone ? 13 : 12,
        fontWeight: opts.strong ? 700 : 400,
        border: '1px solid transparent',
        background: 'transparent',
        borderRadius: 4,
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
      onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
    />
  );

  const th: React.CSSProperties = {
    padding: '4px 6px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    background: 'var(--color-subtle)',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap',
    textAlign: 'center',
  };
  const td: React.CSSProperties = { padding: 0, borderBottom: '1px solid var(--color-sunken)', textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' };
  const calc: React.CSSProperties = { ...td, padding: '4px 6px', fontWeight: 700 };
  const goalBg = 'var(--color-warning-soft)';
  const card: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    boxShadow: 'var(--shadow-sm)',
    marginBottom: 12,
    overflow: 'hidden',
  };
  const RateCell = ({ r, style }: { r: number | null; style?: React.CSSProperties }) => (
    <td style={{ ...calc, color: rateColor(r), ...style }}>{fmtRate(r)}</td>
  );

  // ---- 月間(上) ----
  const monthly = (
    <div style={card}>
      <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 800, borderBottom: '1px solid var(--color-border)' }}>
        {departmentName} 月間ストーリー
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-faint)', marginLeft: 8 }}>月目標が空欄なら週目標の合計</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>項目</th>
              <th style={{ ...th, background: goalBg }}>月目標</th>
              <th style={th}>実績</th>
              <th style={th}>達成率</th>
              <th style={th}>残り</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const goal = monthGoal(m.key);
              const total = monthTotal(m.key);
              return (
                <tr key={m.key}>
                  <td style={{ ...td, textAlign: 'left', padding: '4px 8px', fontWeight: 700 }}>{m.label}</td>
                  <td style={{ ...td, background: goalBg, width: 90 }}>
                    {cellInput(monthCell(m.key), { placeholder: cumGoal(weeks.length - 1, m.key)?.toString() ?? '' })}
                  </td>
                  <td style={calc}>{total}</td>
                  <RateCell r={rateOf(total, goal)} />
                  <td style={calc}>{goal == null ? '—' : Math.max(0, goal - total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ---- 週ごと(カレンダー) ----
  const weekTitle = (week: (string | null)[], wi: number) => {
    const inMonth = week.filter((d): d is string => !!d);
    return (
      <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 800, borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, alignItems: 'baseline' }}>
        第{wi + 1}週
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-muted)' }}>
          {md(inMonth[0])}〜{md(inMonth[inMonth.length - 1])}
        </span>
      </div>
    );
  };
  const dayHead = (d: string | null, i: number) => {
    const color = i === 6 ? 'var(--color-danger)' : i === 5 ? 'var(--color-primary)' : undefined;
    return (
      <span style={{ color, fontWeight: d === today ? 900 : 700 }}>
        {d ? Number(d.slice(8, 10)) : ''}
        <span style={{ fontWeight: 400, marginLeft: 2 }}>{WEEKDAYS[i]}</span>
      </span>
    );
  };

  // PC: 行=項目、列=曜日(カレンダーを横に)+ 週・累計の集計
  const weekPc = (week: (string | null)[], wi: number) => (
    <div key={wi} style={card}>
      {weekTitle(week, wi)}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', minWidth: 980 }}>
          <colgroup>
            <col style={{ width: 90 }} />
            {week.map((_d, i) => (
              <col key={i} />
            ))}
            <col style={{ width: 62 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 62 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 66 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>項目</th>
              {week.map((d, i) => (
                <th key={i} style={{ ...th, ...(d === today ? { background: 'var(--color-primary-soft)' } : {}) }}>
                  {dayHead(d, i)}
                </th>
              ))}
              <th style={th}>週計</th>
              <th style={{ ...th, background: goalBg }}>週目標</th>
              <th style={th}>週達成</th>
              <th style={th}>累計</th>
              <th style={th}>累計目標</th>
              <th style={th}>累計達成</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => {
              const sum = weekSum(wi, m.key);
              const cum = cumSum(wi, m.key);
              const cg = cumGoal(wi, m.key);
              return (
                <tr key={m.key}>
                  <td style={{ ...td, textAlign: 'left', padding: '4px 8px', fontWeight: 700 }}>{m.label}</td>
                  {week.map((d, i) => (
                    <td key={i} style={{ ...td, borderLeft: '1px solid var(--color-sunken)', background: d ? undefined : 'var(--color-sunken)' }}>
                      {d && cellInput(dayCell(d, m.key))}
                    </td>
                  ))}
                  <td style={{ ...calc, borderLeft: '1px solid var(--color-border)' }}>{sum}</td>
                  <td style={{ ...td, background: goalBg }}>{cellInput(weekCell(wi, m.key), { strong: true })}</td>
                  <RateCell r={rateOf(sum, weekGoal(wi, m.key))} />
                  <td style={{ ...calc, borderLeft: '1px solid var(--color-border)' }}>{cum}</td>
                  <td style={calc}>{cg ?? '—'}</td>
                  <RateCell r={rateOf(cum, cg)} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  // 携帯: 行=項目、列=曜日(要望: PCと同じ向き)。週・累計の集計は下の表(行=項目)に分けて画面幅に収める
  const weekPhone = (week: (string | null)[], wi: number) => (
    <div key={wi} style={card}>
      {weekTitle(week, wi)}
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 70 }} />
          {week.map((_d, i) => (
            <col key={i} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, padding: '4px 2px' }} />
            {week.map((d, i) => (
              <th
                key={i}
                style={{ ...th, padding: '4px 0', fontSize: 11, lineHeight: 1.25, ...(d === today ? { background: 'var(--color-primary-soft)' } : {}) }}
              >
                {d ? (
                  <span style={{ color: i === 6 ? 'var(--color-danger)' : i === 5 ? 'var(--color-primary)' : undefined }}>
                    {Number(d.slice(8, 10))}
                    <br />
                    <span style={{ fontWeight: 400 }}>{WEEKDAYS[i]}</span>
                  </span>
                ) : (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-faint)' }}>{WEEKDAYS[i]}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => (
            <tr key={m.key}>
              <td style={{ ...td, textAlign: 'left', padding: '4px 4px 4px 6px', fontSize: 10.5, fontWeight: 700 }}>{m.label}</td>
              {week.map((d, i) => (
                <td key={i} style={{ ...td, borderLeft: '1px solid var(--color-sunken)', background: d ? undefined : 'var(--color-sunken)' }}>
                  {d && cellInput(dayCell(d, m.key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {/* 週・累計の集計(行=項目) */}
      <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed', borderTop: '2px solid var(--color-border)' }}>
        <colgroup>
          <col style={{ width: 70 }} />
          <col />
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, padding: '4px 2px' }} />
            {['週計', '週目標', '週達成', '累計', '累計目標', '累計達成'].map((h) => (
              <th key={h} style={{ ...th, padding: '4px 1px', fontSize: 10, ...(h === '週目標' ? { background: goalBg } : {}) }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((m) => {
            const sum = weekSum(wi, m.key);
            const cum = cumSum(wi, m.key);
            const cg = cumGoal(wi, m.key);
            const cellPad: React.CSSProperties = { padding: '5px 4px' };
            return (
              <tr key={m.key}>
                <td style={{ ...td, textAlign: 'left', padding: '4px 4px 4px 6px', fontSize: 10.5, fontWeight: 700 }}>{m.label}</td>
                <td style={{ ...calc, ...cellPad }}>{sum}</td>
                <td style={{ ...td, background: goalBg }}>{cellInput(weekCell(wi, m.key), { strong: true })}</td>
                <RateCell r={rateOf(sum, weekGoal(wi, m.key))} style={cellPad} />
                <td style={{ ...calc, ...cellPad, borderLeft: '1px solid var(--color-border)' }}>{cum}</td>
                <td style={{ ...calc, ...cellPad }}>{cg ?? '—'}</td>
                <RateCell r={rateOf(cum, cg)} style={cellPad} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {monthly}
      {weeks.map((w, wi) => (isPhone ? weekPhone(w, wi) : weekPc(w, wi)))}
    </div>
  );
}
