import { useState } from 'react';
import { PersonalDailyKey, PersonalStatsSheet } from '../../hooks/useApi';
import { Column, DataTable } from '../../components/DataTable';
import { InlineNumber } from '../../components/InlineEdit';
import { useIsPhone } from '../../lib/useIsPhone';
import { fmtRate, rateColor } from './parts';
import { CumulativeChart } from './charts';
import { LANDING_HELP, PLAN_METRICS, PlanMetric, computeApSummary, landingOf, fmtMinutes, fmtSeats, isCounted, todayKeyJst } from './apStats';

/**
 * アポインターのシート(要望): 日ごとの行に 稼働時間(1〜8hを15分刻み)・席数(稼働時間/176)と、
 * トス(青)・アポ(オレンジ)の「月初予算 / 実績 / 着地見込み(今日までは実績、明日以降は手入力)」を並べる。セル操作は案件管理と同じ DataTable
 * (矢印・Tab・Enter、範囲選択、コピー・貼り付け)。PC は表の右に累計、携帯は上に累計を出してトス/アポを切り替える。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const WORK_OPTIONS = Array.from({ length: (480 - 60) / 15 + 1 }, (_, i) => 60 + i * 15);

type SheetRow = { id: string; kind: 'day' | 'week' | 'total'; label: string; date?: string; days: string[] };

/** 稼働時間の貼り付け: "8:00" / "7:30" / "7.5" / "8" → 分(15分単位、1〜8h)。読めなければ undefined */
function parseWorkMinutes(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  const min = hm ? Number(hm[1]) * 60 + Number(hm[2]) : Number(t) * 60;
  if (!Number.isFinite(min)) return undefined;
  const r = Math.round(min / 15) * 15;
  return r >= 60 && r <= 480 ? r : undefined;
}

/** 回数の貼り付け・入力: 0以上の整数だけ。空は手入力を消す。読めなければ undefined */
function parseCount(text: string): number | null | undefined {
  const t = text.trim().replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/**
 * 入力欄を色付きの枠で包むと、DataTable の Enter(セルのクリックと同じ動き)が内側の入力欄まで届かないため、
 * 枠自体へのクリックを中の入力欄へ渡す
 */
function ForwardClick({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div
      style={style}
      onClick={(e) => {
        if (e.target === e.currentTarget) (e.currentTarget.firstElementChild as HTMLElement | null)?.click();
      }}
    >
      {children}
    </div>
  );
}

const dowOf = (d: string) => new Date(`${d}T00:00:00`).getDay();
const mdOf = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`;

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
  const isPhone = useIsPhone();
  const [phoneMetric, setPhoneMetric] = useState<PlanMetric['key']>('TOSS_UP');
  const days = sheet.days;
  const today = todayKeyJst();

  const textOf = (d: string, key: PersonalDailyKey) => {
    const draft = drafts[`${d}|${key}`];
    if (draft !== undefined) return draft;
    const v = manualOf(d, key);
    return v == null ? '' : String(v);
  };
  const numOf = (d: string, key: PersonalDailyKey) => {
    const t = textOf(d, key);
    return t === '' ? null : Number(t);
  };
  const getter = { value: (d: string, key: PersonalDailyKey) => valueOf(d, key) };
  const sum = (ds: string[], f: (d: string) => number) => ds.reduce((a, d) => a + f(d), 0);
  const summary = computeApSummary(days, today, getter);

  const save = (d: string, key: PersonalDailyKey, v: number | null | undefined) => {
    if (v === undefined) return; // 読めない値は無視
    setDaily(d, key, v == null ? '' : String(v));
  };

  // ---- 行: 日ごと + 日曜(と月末)で週計 + 月合計 ----
  const rows: SheetRow[] = [];
  let weekStart = 0;
  days.forEach((d, i) => {
    rows.push({ id: d, kind: 'day', label: d, date: d, days: [d] });
    if (dowOf(d) === 0 || i === days.length - 1) {
      rows.push({ id: `w-${d}`, kind: 'week', label: '週計', days: days.slice(weekStart, i + 1) });
      weekStart = i + 1;
    }
  });
  rows.push({ id: 'total', kind: 'total', label: '月合計', days });

  // 稼働時間は今日までの日だけ数える(先の日は予定)
  const workSum = (r: SheetRow) => sum(r.days.filter((d) => isCounted(d, today)), (d) => valueOf(d, 'WORK_MINUTES'));
  const faint = (d: string) => (isCounted(d, today) ? undefined : 'var(--color-text-faint)');
  // 非稼働日(稼働時間が空の日)はグレー、週計・月合計は薄い黄色で行ごと塗る。それ以外の行は色を付けない(要望)
  const isOffDay = (r: SheetRow) => r.kind === 'day' && !(valueOf(r.date!, 'WORK_MINUTES') > 0);

  const dateCol: Column<SheetRow> = {
    key: 'date',
    label: '日付',
    width: isPhone ? 64 : 56,
    locked: true,
    render: (r) => {
      if (r.kind !== 'day') return <b style={{ fontSize: 11 }}>{r.label}</b>;
      const dow = dowOf(r.date!);
      return (
        <span style={{ fontWeight: 600 }}>
          {mdOf(r.date!)}
          {isPhone && (
            <span style={{ marginLeft: 3, fontSize: 10, fontWeight: 400, color: dow === 0 || dow === 6 ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>
              {WEEKDAYS[dow]}
            </span>
          )}
        </span>
      );
    },
    copyValue: (r) => (r.kind === 'day' ? mdOf(r.date!) : r.label),
  };
  const dowCol: Column<SheetRow> = {
    key: 'dow',
    label: '曜',
    width: 36,
    locked: true,
    render: (r) => {
      if (r.kind !== 'day') return null;
      const dow = dowOf(r.date!);
      return <span style={{ color: dow === 0 || dow === 6 ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>{WEEKDAYS[dow]}</span>;
    },
    copyValue: (r) => (r.kind === 'day' ? WEEKDAYS[dowOf(r.date!)] : ''),
  };
  const workCol: Column<SheetRow> = {
    key: 'work',
    label: '稼働時間',
    width: 54,
    locked: true,
    render: (r) => {
      if (r.kind !== 'day') {
        const m = workSum(r);
        return <b>{m > 0 ? fmtMinutes(m) : ''}</b>;
      }
      const d = r.date!;
      const min = valueOf(d, 'WORK_MINUTES');
      return (
        <div style={{ lineHeight: 1.15 }} title={isCounted(d, today) ? undefined : '予定(当日になったら稼働時間に数えます)'}>
          <select
            value={textOf(d, 'WORK_MINUTES')}
            onChange={(e) => setDaily(d, 'WORK_MINUTES', e.target.value)}
            aria-label="稼働時間"
            style={{ width: 'calc(100% + 8px)', margin: '0 -4px', border: 'none', background: 'transparent', boxShadow: 'none', padding: 0, fontSize: 12, height: 18, color: faint(d) ?? 'var(--color-text)' }}
          >
            <option value="" />
            {WORK_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {fmtMinutes(o)}
              </option>
            ))}
          </select>
          {isPhone && min > 0 && <div style={{ fontSize: 9, color: faint(d) ?? 'var(--color-text-muted)' }}>席 {fmtSeats(min, 3)}</div>}
        </div>
      );
    },
    copyValue: (r) => {
      if (r.kind !== 'day') return '';
      const m = valueOf(r.date!, 'WORK_MINUTES');
      return m > 0 ? fmtMinutes(m) : '';
    },
    pasteValue: (r, text) => {
      if (r.kind === 'day') save(r.date!, 'WORK_MINUTES', parseWorkMinutes(text));
    },
  };
  const seatCol: Column<SheetRow> = {
    key: 'seats',
    label: '席数',
    width: 46,
    locked: true,
    render: (r) => {
      const m = r.kind === 'day' ? valueOf(r.date!, 'WORK_MINUTES') : workSum(r);
      return (
        <div
          style={{
            textAlign: 'center',
            fontWeight: r.kind === 'day' ? 400 : 700,
            color: r.kind === 'day' ? faint(r.date!) : undefined,
          }}
        >
          {fmtSeats(m, r.kind === 'day' ? 3 : 2) || ' '}
        </div>
      );
    },
    copyValue: (r) => fmtSeats(r.kind === 'day' ? valueOf(r.date!, 'WORK_MINUTES') : workSum(r), r.kind === 'day' ? 3 : 2),
  };

  const metricCols = (m: PlanMetric): Column<SheetRow>[] => {
    const toss = m.key === 'TOSS_UP';
    const color = toss ? 'var(--color-primary)' : 'var(--color-appo)';
    const soft = toss ? 'var(--color-primary-soft)' : 'var(--color-appo-soft)';
    // 見出しは2段: 上にトス(青)/アポ(オレンジ)、下に月初予算・実績・着地見込み。入力欄は稼働日は白のまま(要望)
    const numberCol = (key: PersonalDailyKey, label: string, actual?: boolean): Column<SheetRow> => ({
      key,
      label: `${m.label}${label}`,
      width: key === m.revised ? 74 : isPhone ? 66 : 64,
      locked: true,
      headerBackground: soft,
      group: { key: m.key, label: <span style={{ color }}>{m.label}</span>, background: soft },
      renderHeader: () => <span style={{ color, fontWeight: actual ? 800 : 700 }}>{label}</span>,
      render: (r) => {
        if (r.kind !== 'day') {
          // 着地見込みの週計・月合計
          if (key === m.revised) {
            return (
              <div style={{ textAlign: 'center', fontWeight: 700 }} title={LANDING_HELP}>
                {sum(r.days, (d) => landingOf(getter, d, m, today))}
              </div>
            );
          }
          return (
            <div style={{ textAlign: 'center', fontWeight: 700, color: actual ? color : undefined }}>
              {sum(r.days, (d) => valueOf(d, key))}
            </div>
          );
        }
        const d = r.date!;
        // 着地見込み: 当日を含む過去日は実績と同じで入力不可、未来日は手打ち(要望)
        if (key === m.revised && d <= today) {
          return <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{landingOf(getter, d, m, today) || ''}</span>;
        }
        // 実績は今日までの日にだけ入力する(要望)
        if (actual && d > today) return <span />;
        const autoV = actual ? autoOf(d, key) : undefined;
        const cell = (
          <InlineNumber
            value={numOf(d, key)}
            placeholder={autoV ? String(autoV) : undefined}
            title={autoV ? `システム上の実績: ${autoV}(入力すると上書き)` : undefined}
            onSave={(n) => save(d, key, n == null ? null : parseCount(String(n)))}
            align="center"
          />
        );
        return (
          <ForwardClick style={actual ? { color, fontWeight: 700 } : key === m.revised ? { color: 'var(--color-text)', fontWeight: 700 } : { color: 'var(--color-text-muted)' }}>{cell}</ForwardClick>
        );
      },
      copyValue: (r) => {
        if (r.kind !== 'day') return '';
        if (key === m.revised) return String(landingOf(getter, r.date!, m, today) || '');
        return actual ? String(valueOf(r.date!, key) || '') : textOf(r.date!, key);
      },
      // 貼り付けも入力と同じ: 着地見込みは未来日だけ、実績は今日までだけ
      pasteValue: (r, text) => {
        if (r.kind !== 'day' || (key === m.revised && r.date! <= today) || (actual && r.date! > today)) return;
        save(r.date!, key, parseCount(text));
      },
    });
    return [numberCol(m.budget, '月初予算'), numberCol(m.key, '実績', true), numberCol(m.revised, '着地見込み')];
  };

  const columns: Column<SheetRow>[] = isPhone
    ? [dateCol, workCol, ...metricCols(PLAN_METRICS.find((m) => m.key === phoneMetric)!)]
    : [dateCol, dowCol, workCol, seatCol, ...PLAN_METRICS.flatMap(metricCols)];

  // 縞模様(1行おきの色)も消すため、色を付けない行も透明を明示する
  const rowStyle = (r: SheetRow): React.CSSProperties => {
    if (r.kind !== 'day') return { background: 'var(--color-highlight-faint)' };
    if (isOffDay(r)) return { background: 'var(--color-sunken)' };
    return { background: 'transparent' };
  };

  const table = (
    <div className="ps-center">
    <DataTable
      columns={columns}
      rows={rows}
      total={rows.length}
      page={1}
      pageSize={rows.length}
      onPageChange={() => undefined}
      getRowId={(r) => r.id}
      rowStyle={rowStyle}
      fontSize={12}
      pageScroll
      hideRowNumbers
    />
    </div>
  );

  const panel = <SummaryPanel summary={summary} compact={isPhone} />;
  const chartOf = (m: PlanMetric) => <CumulativeChart key={m.key} days={days} today={today} getter={getter} metric={m} />;

  if (isPhone) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {panel}
        {chartOf(PLAN_METRICS.find((m) => m.key === phoneMetric)!)}
        <div style={{ display: 'flex', gap: 4 }}>
          {PLAN_METRICS.map((m) => {
            const on = phoneMetric === m.key;
            const color = m.key === 'TOSS_UP' ? 'var(--color-primary)' : 'var(--color-appo)';
            return (
              <button
                key={m.key}
                onClick={() => setPhoneMetric(m.key)}
                style={{
                  flex: 1,
                  height: 32,
                  fontSize: 13,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: `1px solid ${on ? color : 'var(--color-border-strong)'}`,
                  background: on ? color : 'var(--color-surface)',
                  color: on ? 'var(--color-surface)' : 'var(--color-text-muted)',
                  boxShadow: 'none',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
        {table}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flex: '0 1 auto', minWidth: 0 }}>{table}</div>
      <div style={{ width: 300, flexShrink: 0, position: 'sticky', top: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {panel}
        {PLAN_METRICS.map(chartOf)}
      </div>
    </div>
  );
}

/** 累計(PC は表の右、携帯は上)。トスは青、アポはオレンジで分ける */
function SummaryPanel({ summary, compact }: { summary: ReturnType<typeof computeApSummary>; compact: boolean }) {
  const { workMin, workedDays, restDays, stats } = summary;
  const appo = stats[1];
  const kpi = (label: string, value: React.ReactNode, color?: string) => (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: compact ? 14 : 17, fontWeight: 700, color }}>{value}</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${compact ? 4 : 2}, minmax(0, 1fr))`,
          gap: compact ? 4 : '6px 10px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: compact ? '6px 8px' : '8px 10px',
          textAlign: 'center',
        }}
      >
        {kpi(compact ? '稼働時間' : `稼働時間(今日まで ${workedDays}日)`, workMin > 0 ? fmtMinutes(workMin) : '—')}
        {kpi('席数', workMin > 0 ? fmtSeats(workMin, 2) : '—')}
        {kpi('残日数', `${restDays}日`)}
        {kpi('進捗(アポ)', fmtRate(appo.progress), rateColor(appo.progress))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: compact ? 6 : 8 }}>
        {stats.map((s) => {
          const toss = s.key === 'TOSS_UP';
          const color = toss ? 'var(--color-primary)' : 'var(--color-appo)';
          const soft = toss ? 'var(--color-primary-soft)' : 'var(--color-appo-soft)';
          const ratio = s.plan > 0 ? Math.min(1, s.actual / s.plan) : 0;
          return (
            <div
              key={s.key}
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${toss ? 'var(--color-primary-border)' : 'var(--color-appo-border)'}`,
                borderTop: `3px solid ${color}`,
                borderRadius: 'var(--radius-md)',
                padding: compact ? '6px 8px' : '8px 10px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: compact ? 12 : 13, fontWeight: 800, color }}>{toss ? 'トス' : 'アポ'}</div>
              {/* 実績・当初予算・着地見込みを同じ大きさの枠で並べ、何の数字か分かるように(要望) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4, margin: '4px 0' }}>
                {[
                  { label: toss ? 'トス数' : 'アポ数', value: s.actual, color, bg: soft },
                  { label: '当初予算', value: s.plan, color: 'var(--color-text)', bg: 'var(--color-subtle)' },
                  { label: '着地見込み', value: s.landing, color: 'var(--color-text)', bg: 'var(--color-subtle)' },
                ].map((b) => (
                  <div key={b.label} style={{ background: b.bg, borderRadius: 6, padding: '3px 2px' }}>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 700 }}>{b.label}</div>
                    <div style={{ fontSize: compact ? 17 : 20, fontWeight: 800, color: b.color }}>{b.value}</div>
                  </div>
                ))}
              </div>
              {!compact && (
                <div style={{ height: 6, background: 'var(--color-sunken)', borderRadius: 3, margin: '4px 0' }}>
                  <div style={{ width: `${ratio * 100}%`, height: 6, background: color, borderRadius: 3 }} />
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                残 <b style={{ color: s.rest > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{s.rest}件</b>
                {s.perDay != null && (
                  <>
                    {' '}・ 1日 <b>{s.perDay.toFixed(1)}件</b>必要
                  </>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>平均 {s.avg == null ? '—' : s.avg.toFixed(1)}件/日</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
