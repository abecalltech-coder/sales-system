import { Fragment } from 'react';
import { PersonalDailyKey, PersonalStatsSheet } from '../../hooks/useApi';
import { NumberCell, fmtRate, rateColor } from './parts';
import { PLAN_METRICS, SEAT_HOURS, computeApSummary, fmtMinutes, fmtSeats, isCounted, todayKeyJst } from './apStats';

/**
 * アポインターのシート(要望): 日ごとの行に 稼働時間(1〜8hを15分刻み)・席数(稼働時間/176)と、
 * トス・アポの「月初予算 / 実績 / 修正予算」を並べる。上に月の累計(残日数・残件数・進捗)を出す。
 * 予算は日ごとに「修正予算が入っていればそちらを優先」して残件数・進捗を計算する。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WORK_OPTIONS = Array.from({ length: (480 - 60) / 15 + 1 }, (_, i) => 60 + i * 15);

export function AppointerSheet({
  sheet,
  drafts,
  valueOf,
  manualOf,
  autoOf,
  setDaily,
}: {
  sheet: PersonalStatsSheet;
  drafts: Record<string, string>;
  valueOf: (date: string | null, key: PersonalDailyKey) => number;
  manualOf: (date: string, key: PersonalDailyKey) => number | undefined;
  autoOf: (date: string, key: PersonalDailyKey) => number | undefined;
  setDaily: (date: string, key: PersonalDailyKey, typed: string) => void;
}) {
  const days = sheet.days;
  const today = todayKeyJst();

  const textOf = (d: string, key: PersonalDailyKey) => {
    const draft = drafts[`${d}|${key}`];
    if (draft !== undefined) return draft;
    const v = manualOf(d, key);
    return v == null ? '' : String(v);
  };
  const getter = { value: (d: string, key: PersonalDailyKey) => valueOf(d, key), entered: (d: string, key: PersonalDailyKey) => textOf(d, key) !== '' };
  const sum = (ds: string[], f: (d: string) => number) => ds.reduce((a, d) => a + f(d), 0);

  // ---- 月の累計 ----
  const { workMin, workedDays, restDays, stats } = computeApSummary(days, today, getter);
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
    // 稼働時間は今日までの日だけ数える(先の日は予定)
    const min = sum(ds.filter((d) => isCounted(d, today)), (d) => valueOf(d, 'WORK_MINUTES'));
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
        {item('稼働時間', workMin > 0 ? fmtMinutes(workMin) : '—', `今日まで ${workedDays}日稼働`)}
        {item('席数', workMin > 0 ? fmtSeats(workMin, 2) : '—', `稼働時間 ÷ ${SEAT_HOURS}`)}
        {stats.map((s) =>
          item(`${s.label === 'トス' ? 'トス数' : 'アポイント数'}`, s.actual, `予算 ${s.plan}`),
        )}
        {item(
          '平均値(1日)',
          stats.map((s) => `${s.label} ${s.avg == null ? '—' : s.avg.toFixed(1)}`).join(' / '),
          '実績 ÷ 稼働日数',
        )}
        {item('残日数', `${restDays}日`, '今日以降の稼働予定日')}
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
                      title={isCounted(d, today) ? undefined : '予定(当日になったら稼働時間に数えます)'}
                      style={{
                        width: '100%',
                        height: 22,
                        border: 'none',
                        background: 'transparent',
                        boxShadow: 'none',
                        fontSize: 12,
                        padding: '0 2px',
                        textAlign: 'center',
                        color: isCounted(d, today) ? 'var(--color-text)' : 'var(--color-text-faint)',
                      }}
                    >
                      <option value="" />
                      {WORK_OPTIONS.map((o) => (
                        <option key={o} value={o}>{fmtMinutes(o)}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...calc, fontWeight: 400, color: isCounted(d, today) ? undefined : 'var(--color-text-faint)' }}>{fmtSeats(min, 3)}</td>
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
