import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { usePeriodMonth } from '../lib/usePeriodMonth';
import { api, ApiError } from '../lib/api';
import { STORY_COLORS } from './SummaryStory';

/**
 * 部署数値(数値管理): 直販ALL・CH東・CH西・CT東ごとに、項目×指標×実績の表。
 * - 指標は手打ち、または「=」で始まる関数(R3=3行目の指標、A3=3行目の実績。+ - * / ( ) と %)。割合の行は 95 と打つと 95%。
 * - 実績は取れるものだけ自動(コール数・有効数はアポインターの個人別数値の「流れ」、トスアップ・前確通過・商談は トス/アポ実績)。取れないものは空欄。
 * - 直販ALLの実績は3部署の合計から計算。見出しの色はストーリーの部署色。
 */

type Actuals = { calls: number; valid: number; tossUp: number; preOk: number; meetings: number };
interface MetricsResponse {
  period: string;
  departments: { id: string; name: string; actuals: Actuals; targets: Record<string, string> }[];
  allTargets: Record<string, string>;
}

type RowDef = { key: string; label: string; kind: 'n' | 'r'; yellow?: boolean };
const ROWS: RowDef[] = [
  { key: 'etSites', label: 'ET拠点数', kind: 'n', yellow: true },
  { key: 'multiRate', label: '複数拠点比率', kind: 'r' },
  { key: 'afterPassRate', label: '後確通過率', kind: 'r' },
  { key: 'etCorps', label: 'ET法人数', kind: 'n', yellow: true },
  { key: 'corpRate', label: '法人成約率', kind: 'r' },
  { key: 'validMeetings', label: '有効商談数', kind: 'n' },
  { key: 'validMeetingRate', label: '有効商談実施率', kind: 'r' },
  { key: 'meetings', label: '商談数', kind: 'n' },
  { key: 'meetingRate', label: '商談実施率', kind: 'r' },
  { key: 'preOkCount', label: '前確通過数', kind: 'n', yellow: true },
  { key: 'preOkRate', label: '前確通過率', kind: 'r' },
  { key: 'tossUp', label: 'トスアップ数', kind: 'n' },
  { key: 'tossUpRate', label: 'トスアップ率', kind: 'r' },
  { key: 'valid', label: '有効数', kind: 'n' },
  { key: 'validRate', label: '有効率', kind: 'r' },
  { key: 'calls', label: 'コール数', kind: 'n' },
];
const YELLOW = '#ffff59';
const RED = '2px solid #d32f2f';

/** 実績(自動で取れるものだけ。ほかは null=空欄)。割合は 分子÷分母、分母が0なら0% */
function actualOf(a: Actuals): Record<string, number | null> {
  const r = (x: number, y: number) => (y ? x / y : 0);
  return {
    etSites: null, multiRate: null, afterPassRate: null, etCorps: null, corpRate: null, validMeetings: null, validMeetingRate: null,
    meetings: a.meetings,
    meetingRate: r(a.meetings, a.preOk),
    preOkCount: a.preOk,
    preOkRate: r(a.preOk, a.tossUp),
    tossUp: a.tossUp,
    tossUpRate: r(a.tossUp, a.valid),
    valid: a.valid,
    validRate: r(a.valid, a.calls),
    calls: a.calls,
  };
}

/** 小さな式の計算(eval は使わない)。R<n>/A<n> は n行目の指標/実績。失敗は null */
function evalExpr(src: string, ref: (kind: 'R' | 'A', n: number) => number | null): number | null {
  const s = src.replace(/[\s,]/g, '').replace(/[（）]/g, (c) => (c === '（' ? '(' : ')')).toUpperCase();
  let i = 0;
  let bad = false;
  const peek = () => s[i];
  const factor = (): number => {
    if (peek() === '-') {
      i++;
      return -factor();
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() === ')') i++;
      else bad = true;
      return v;
    }
    const m = /^(?:(\d+\.?\d*|\.\d+)(%?)|([RA])(\d+))/.exec(s.slice(i));
    if (!m) {
      bad = true;
      return 0;
    }
    i += m[0].length;
    if (m[1] !== undefined) return m[2] ? Number(m[1]) / 100 : Number(m[1]);
    const v = ref(m[3] as 'R' | 'A', Number(m[4]));
    if (v === null) bad = true;
    return v ?? 0;
  };
  const term = (): number => {
    let v = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const w = factor();
      v = op === '*' ? v * w : w === 0 ? (bad = true, 0) : v / w;
    }
    return v;
  };
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const w = term();
      v = op === '+' ? v + w : v - w;
    }
    return v;
  };
  const v = expr();
  return bad || i < s.length || !Number.isFinite(v) ? null : v;
}

const fmt = (v: number | null, kind: 'n' | 'r') => (v === null ? '' : kind === 'r' ? `${(v * 100).toFixed(1)}%` : Math.round(v * 100) / 100 === Math.round(v) ? Math.round(v).toLocaleString('ja-JP') : v.toLocaleString('ja-JP', { maximumFractionDigits: 2 }));

export function DeptMetricsPage() {
  const [period] = usePeriodMonth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['department-summary', 'metrics', period],
    queryFn: () => api.get<MetricsResponse>(`/department-summary/metrics?period=${period}`),
  });
  const depts = ['CH東', 'CH西', 'CT東'].map((n) => data?.departments.find((d) => d.name === n)).filter((d): d is NonNullable<typeof d> => !!d);
  const sum = (f: (a: Actuals) => number) => depts.reduce((a, d) => a + f(d.actuals), 0);
  const allActuals: Actuals = { calls: sum((a) => a.calls), valid: sum((a) => a.valid), tossUp: sum((a) => a.tossUp), preOk: sum((a) => a.preOk), meetings: sum((a) => a.meetings) };

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 'none' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">部署数値</h1>
            <MonthSwitcher />
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: '0 0 10px', lineHeight: 1.6 }}>
          指標は手打ち、または「=」で始まる関数(例 =R12*A4 / =A1/A4。R3=3行目の指標、A3=3行目の実績。割合の行は 95 と打つと 95%)。実績は取れるものだけ自動で入ります。
        </p>
        {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>}
        {data && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
            <MetricTable title="直販ALL" deptKey="ALL" period={period} targets={data.allTargets} actuals={allActuals} />
            {depts.map((d) => (
              <MetricTable key={d.id} title={d.name} deptKey={d.id} period={period} targets={d.targets} actuals={d.actuals} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function MetricTable({ title, deptKey, period, targets, actuals }: { title: string; deptKey: string; period: string; targets: Record<string, string>; actuals: Actuals }) {
  const color = STORY_COLORS[title === '直販ALL' ? '直販ALL' : title];
  const act = actualOf(actuals);

  /** n行目の実績 / 指標(指標は手打ちの数字か関数。割合の行の数字だけは % として読む) */
  const actualAt = (n: number) => act[ROWS[n - 1]?.key] ?? null;
  const targetAt = (n: number, stack: number[] = []): number | null => {
    const row = ROWS[n - 1];
    if (!row || stack.includes(n)) return null;
    const raw = (targets[row.key] ?? '').trim();
    if (!raw) return null;
    if (raw.startsWith('=')) {
      return evalExpr(raw.slice(1), (kind, m) => (kind === 'A' ? actualAt(m) : targetAt(m, [...stack, n])));
    }
    const v = Number(raw.replace(/[,%]/g, ''));
    if (!Number.isFinite(v)) return null;
    return raw.endsWith('%') || row.kind === 'r' ? v / 100 : v;
  };

  const th: React.CSSProperties = { background: color.mid, fontSize: 14, fontWeight: 800, padding: '8px 10px', border: '1px solid var(--color-border-strong)', textAlign: 'center' };
  const td: React.CSSProperties = { fontSize: 13, fontWeight: 700, padding: 0, border: '1px solid var(--color-border-strong)', textAlign: 'center', height: 30 };
  return (
    <table style={{ borderCollapse: 'collapse', width: 330, tableLayout: 'fixed', background: 'var(--color-surface)' }}>
      <colgroup>
        <col style={{ width: 130 }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 100 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: 'left' }}>{title === '直販ALL' ? '直販ALL' : `${title}部署`}</th>
          <th style={th}>指標</th>
          <th style={{ ...th, borderTop: RED, borderLeft: RED, borderRight: RED }}>実績</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r, i) => {
          const bg = r.yellow ? YELLOW : undefined;
          const last = i === ROWS.length - 1;
          return (
            <tr key={r.key}>
              <td style={{ ...td, textAlign: 'left', padding: '0 8px', background: bg }}>
                <span style={{ fontSize: 10, color: 'var(--color-text-faint)', marginRight: 4, fontWeight: 400 }}>{i + 1}</span>
                {r.label}
              </td>
              <td style={{ ...td, background: bg }}>
                <TargetCell period={period} deptKey={deptKey} rowKey={r.key} raw={targets[r.key] ?? ''} shown={fmt(targetAt(i + 1), r.kind)} bg={bg} />
              </td>
              <td style={{ ...td, background: bg, borderLeft: RED, borderRight: RED, ...(last ? { borderBottom: RED } : {}) }}>{fmt(act[r.key] ?? null, r.kind)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** 指標のセル: 打っている間は入力そのまま(関数も)、離れたら保存して計算結果を出す */
function TargetCell({ period, deptKey, rowKey, raw, shown, bg }: { period: string; deptKey: string; rowKey: string; raw: string; shown: string; bg?: string }) {
  const [draft, setDraft] = useState(raw);
  const [focus, setFocus] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!focus) setDraft(raw);
  }, [raw, focus]);
  const save = useMutation({
    mutationFn: (v: string) => api.put('/department-summary/metric-target', { period, departmentId: deptKey, key: rowKey, value: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['department-summary', 'metrics', period] }),
    onError: (err) => {
      window.alert(err instanceof ApiError ? err.message : '保存できませんでした');
      setDraft(raw);
    },
  });
  return (
    <input
      value={focus ? draft : shown || draft}
      onFocus={() => {
        setFocus(true);
        setDraft(raw);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocus(false);
        if (draft.trim() !== raw) save.mutate(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      title={raw.startsWith('=') ? raw : undefined}
      style={{ width: '100%', height: '100%', boxSizing: 'border-box', border: 'none', background: bg ?? 'transparent', textAlign: 'center', fontSize: 13, fontWeight: 700, boxShadow: 'none', borderRadius: 0 }}
    />
  );
}
