import { Fragment } from 'react';
import { PersonalDailyKey, PersonalStatsSheet } from '../../hooks/useApi';
import { NumberCell, fmtRate, rateColor, rateOf } from './parts';

/**
 * アポインターのシート(要望): 日ごとの行に 稼働時間(1〜8hを15分刻み)・席数(稼働時間/176)と、
 * トス・アポの「月初予算 / 実績 / 修正予算」を並べる。上に月の累計(残日数・残件数・進捗)を出す。
 * 予算は日ごとに「修正予算が入っていればそちらを優先」して残件数・進捗を計算する。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const SEAT_HOURS = 176;
const WORK_OPTIONS = Array.from({ length: (480 - 60) / 15 + 1 }, (_, i) => 60 + i * 15);
const PLAN_METRICS = [
  { key: 'TOSS_UP', label: 'トス', budget: 'TOSS_UP_BUDGET', revised: 'TOSS_UP_REVISED' },
  { key: 'APPOINTMENT', label: 'アポ', budget: 'APPOINTMENT_BUDGET', revised: 'APPOINTMENT_REVISED' },
] as const;

const fmtMinutes = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const fmtSeats = (min: number, digits: number) => (min > 0 ? (min / 60 / SEAT_HOURS).toFixed(digits) : '');

function todayKeyJst(): string {
  const j = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return j.toISOString().slice(0, 10);
}

export function AppointerSheet({
  sheet,
  month,
  drafts,
  valueOf,
  manualOf,
  autoOf,
  setDaily,
}: {
  sheet: PersonalStatsSheet;
  month: string;
  drafts: Record<string, string>;
  valueOf: (date: string | null, key: PersonalDailyKey) => number;
  manualOf: (date: string, key: PersonalDailyKey) => number | undefined;
  autoOf: (date: string, key: PersonalDailyKey) => number | undefined;
  setDaily: (date: string, key: PersonalDailyKey, typed: string) => void;
}) {
  const days = sheet.days;
  const today = todayKeyJst();
  const thisMonth = today.slice(0, 7);

  const textOf = (d: string, key: PersonalDailyKey) => {
    const draft = drafts[`${d}|${key}`];
    if (draft !== undefined) return draft;
    const v = manualOf(d, key);
    return v == null ? '' : String(v);
  };
  /** その日の予算(修正予算が入っていれば優先) */
  const planOf = (d: string, m: (typeof PLAN_METRICS)[number]) => (textOf(d, m.revised) !== '' ? valueOf(d, m.revised) : valueOf(d, m.budget));
  const sum = (ds: string[], f: (d: string) => number) => ds.reduce((a, d) => a + f(d), 0);

  // ---- 月の累計 ----
  const workMin = sum(days, (d) => valueOf(d, 'WORK_MINUTES'));
  const workedDays = days.filter((d) => valueOf(d, 'WORK_MINUTES') > 0).length;
  // 残日数: 今日以降で予算が入っている日(予算が1日も無ければ今日以降の日数)。過去の月は0
  const remainingDays = month < thisMonth ? [] : days.filter((d) => month > thisMonth || d >= today);
  const budgetedRemaining = remainingDays.filter((d) => PLAN_METRICS.some((m) => planOf(d, m) > 0));
  const anyBudget = days.some((d) => PLAN_METRICS.some((m) => planOf(d, m) > 0));
  const restDays = anyBudget ? budgetedRemaining.length : remainingDays.length;
  // 進捗: 今日までの予算(=今日時点で100%の数)に対するアポ実績
  const daysToDate = month > thisMonth ? [] : days.filter((d) => month < thisMonth || d <= today);

  const stats = PLAN_METRICS.map((m) => {
    const actual = sum(days, (d) => valueOf(d, m.key));
    const plan = sum(days, (d) => planOf(d, m));
    const rest = Math.max(0, plan - actual);
    return {
      ...m,
      actual,
      plan,
      rest,
      perDay: restDays > 0 ? rest / restDays : null,
      avg: workedDays > 0 ? actual / workedDays : null,
      progress: rateOf(actual, sum(daysToDate, (d) => planOf(d, m)) || null),
    };
  });
  const appo = stats[1];

  // ---- 表 ----
  const border = '1px solid var(--color-border)';
  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '2px 4px', borderRight: border, borderBottom: border, textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
  const td: React.CSSProperties = { borderRight: border, borderBottom: border, padding: 0, height: 24, textAlign: 'center', fontSize: 12, whiteSpace: 'nowrap' };
  const blue: React.CSSProperties = { ...th, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' };
  const green: React.CSSProperties = { ...th, background: 'var(--color-success-soft)', color: 'var(--color-success)' };
  const plain: React.CSSProperties = { ...th, background: 'var(--color-subtle)' };
  const calc: React.CSSProperties = { ...td, background: 'var(--color-highlight-soft)', fontWeight: 600 };

  // 日曜(と月末)で週を区切って小計行を入れる
  const weekEnds = new Set(days.filter((d, i) => new Date(`${d}T00:00:00`).getDay() === 0 || i === days.length - 1));
  const totalsRow = (label: string, ds: string[], key: string) => {
    const min = sum(ds, (d) => valueOf(d, 'WORK_MINUTES'));
    return (
      <tr key={key}>
        <td colSpan={2} style={{ ...calc, fontSize: 11 }}>{label}</td>
        <td style={calc}>{min > 0 ? fmtMinutes(min) : ''}</td>
        <td style={calc}>{fmtSeats(min, 2)}</td>
        {PLAN_METRICS.map((m) => {
          const revisedEntered = ds.some((d) => textOf(d, m.revised) !== '');
          return (
            <Fragment key={m.key}>
              <td style={calc}>{sum(ds, (d) => valueOf(d, m.budget))}</td>
              <td style={{ ...calc, color: 'var(--color-primary)' }}>{sum(ds, (d) => valueOf(d, m.key))}</td>
              <td style={calc}>{revisedEntered ? sum(ds, (d) => valueOf(d, m.revised)) : ''}</td>
            </Fragment>
          );
        })}
      </tr>
    );
  };

  const item = (label: string, value: React.ReactNode, sub?: React.ReactNode, color?: string) => (
    <div style={{ minWidth: 72 }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      {sub != null && <div style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{sub}</div>}
    </div>
  );

  let weekStart = 0;
  return (
    <>
      {/* 累計 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          gap: '8px 18px',
          background: 'var(--color-surface)',
          border,
          borderRadius: 'var(--radius-md)',
          padding: '8px 12px',
          marginBottom: 10,
        }}
      >
        {item('名前', sheet.user.name)}
        {item('稼働時間', workMin > 0 ? fmtMinutes(workMin) : '—', `${workedDays}日稼働`)}
        {item('席数', workMin > 0 ? fmtSeats(workMin, 2) : '—', `稼働時間 ÷ ${SEAT_HOURS}`)}
        {stats.map((s) =>
          item(`${s.label === 'トス' ? 'トス数' : 'アポイント数'}`, s.actual, `予算 ${s.plan}`),
        )}
        {item(
          '平均値(1日)',
          stats.map((s) => `${s.label} ${s.avg == null ? '—' : s.avg.toFixed(1)}`).join(' / '),
          '実績 ÷ 稼働日数',
        )}
        {item('残日数', `${restDays}日`)}
        {stats.map((s) =>
          item(`残${s.label}`, `${s.rest}件`, s.perDay == null ? undefined : `1日 ${s.perDay.toFixed(1)}件必要`, s.rest > 0 ? 'var(--color-danger)' : 'var(--color-success)'),
        )}
        {item('進捗(アポ)', fmtRate(appo.progress), '今日までの予算に対する実績', rateColor(appo.progress))}
      </div>

      {/* 日別 */}
      <div style={{ overflow: 'auto', border, borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', maxHeight: 'calc(var(--viewport-height) - 260px)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: 640 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...plain, minWidth: 44 }}>日付</th>
              <th rowSpan={2} style={plain}>曜日</th>
              <th rowSpan={2} style={{ ...plain, minWidth: 64 }}>稼働時間</th>
              <th rowSpan={2} style={{ ...plain, minWidth: 48 }}>席数</th>
              {PLAN_METRICS.map((m) => (
                <th key={m.key} colSpan={3} style={{ ...plain, fontSize: 11 }}>{m.label}</th>
              ))}
            </tr>
            <tr>
              {PLAN_METRICS.map((m) => (
                <Fragment key={m.key}>
                  <th style={{ ...green, top: 19 }}>月初予算</th>
                  <th style={{ ...blue, top: 19 }}>実績</th>
                  <th style={{ ...green, top: 19 }}>修正予算</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d, i) => {
              const dow = new Date(`${d}T00:00:00`).getDay();
              const weekend = dow === 0 || dow === 6;
              const bg = d === today ? 'var(--color-primary-soft)' : weekend ? 'var(--color-sunken)' : undefined;
              const min = valueOf(d, 'WORK_MINUTES');
              const rows = [
                <tr key={d}>
                  <td style={{ ...td, background: bg, fontWeight: 600 }}>{`${Number(d.slice(5, 7))}/${Number(d.slice(8))}`}</td>
                  <td style={{ ...td, background: bg, color: weekend ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{WEEKDAYS[dow]}</td>
                  <td style={{ ...td, background: bg }}>
                    <select
                      value={textOf(d, 'WORK_MINUTES')}
                      onChange={(e) => setDaily(d, 'WORK_MINUTES', e.target.value)}
                      aria-label="稼働時間"
                      style={{ width: '100%', height: 22, border: 'none', background: 'transparent', boxShadow: 'none', fontSize: 12, padding: '0 2px', textAlign: 'center' }}
                    >
                      <option value="" />
                      {WORK_OPTIONS.map((o) => (
                        <option key={o} value={o}>{fmtMinutes(o)}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...calc, fontWeight: 400 }}>{fmtSeats(min, 3)}</td>
                  {PLAN_METRICS.map((m) => {
                    const autoV = autoOf(d, m.key);
                    return (
                      <Fragment key={m.key}>
                        <td style={{ ...td, background: bg }}>
                          <NumberCell value={textOf(d, m.budget)} onChange={(v) => setDaily(d, m.budget, v)} />
                        </td>
                        <td style={{ ...td, background: bg }}>
                          <NumberCell
                            value={textOf(d, m.key)}
                            placeholder={autoV ? String(autoV) : ''}
                            title={autoV ? `システム上の実績: ${autoV}` : undefined}
                            onChange={(v) => setDaily(d, m.key, v)}
                          />
                        </td>
                        <td style={{ ...td, background: bg }}>
                          <NumberCell value={textOf(d, m.revised)} onChange={(v) => setDaily(d, m.revised, v)} />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>,
              ];
              if (weekEnds.has(d)) {
                rows.push(totalsRow('週計', days.slice(weekStart, i + 1), `w-${d}`));
                weekStart = i + 1;
              }
              return rows;
            })}
            {totalsRow('月合計', days, 'total')}
          </tbody>
        </table>
      </div>
    </>
  );
}
