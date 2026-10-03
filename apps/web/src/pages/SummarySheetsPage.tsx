import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { usePeriodMonth } from '../lib/usePeriodMonth';
import { api, ApiError } from '../lib/api';
import { logCopy } from '../lib/copyLog';

/**
 * サマリー(要望: アプリで作るのではなくこちらで作成。旧「実績/フリーシート/カスタムレポート」は廃止)。
 * 部署ごとに、1人1行で月の実績を並べる。集計の定義は API department-summary.module.ts を参照。
 */

interface Row {
  userId: string;
  name: string;
  roles: string[];
  workHours: number;
  calls: number;
  tossCount: number;
  preOk: number;
  validPreOk: number;
  meetingDone: number;
  et: number;
  reschedule: number;
  zenrenLost: number;
  remainingVisit: number;
  points: number;
  budget: Record<string, string>;
}

interface SummaryResponse {
  period: string;
  departments: { id: string; name: string; rows: Row[] }[];
}

const ROLE_LABELS: Record<string, string> = { SUPER_ADMIN: 'システム管理者', RESPONSIBLE: '責任者', AP_LEADER: 'APリーダー', CL: 'CL', AP: 'AP' };
const ROLE_ORDER = ['SUPER_ADMIN', 'RESPONSIBLE', 'AP_LEADER', 'CL', 'AP'];
const roleLabel = (roles: string[]) => {
  const r = ROLE_ORDER.find((c) => roles.includes(c));
  return r ? ROLE_LABELS[r] : '';
};

const BUDGETS: { key: string; label: string }[] = [
  { key: 'tossUp', label: '予算のトスアップ' },
  { key: 'preOk', label: '予算の前確OK' },
  { key: 'meeting', label: '予算の商談実施' },
  { key: 'contract', label: '予算の商談成約' },
  { key: 'contractSites', label: '予算の成約拠点' },
];

const fixed = (n: number, d: number) => (Number.isFinite(n) ? n.toFixed(d) : '');
const div = (a: number, b: number) => (b ? a / b : NaN);
const num = (v: string | undefined) => (v ? Number(v) : 0);
const fmtHours = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(1));

/** 表示する列(要望の並び順)。totalOnly=合計行の計算用に値を足し合わせられるもの */
type Metric = { key: string; label: string; value: (r: Row) => string; width?: number };

function metricsFor(): Metric[] {
  return [
    { key: 'workHours', label: '稼働時間', value: (r) => fmtHours(r.workHours) },
    { key: 'headcount', label: '稼働人数', value: (r) => fixed(r.workHours / 8, 2) },
    { key: 'seats', label: '席数', value: (r) => fixed(r.workHours / 176, 2) },
    ...BUDGETS.map((b) => ({ key: `budget.${b.key}`, label: b.label, value: (r: Row) => r.budget[b.key] ?? '', width: 74 })),
    { key: 'calls', label: 'コール数', value: (r) => String(r.calls) },
    { key: 'dph', label: 'DPH（1時間あたり）', value: (r) => fixed(div(r.calls, r.workHours), 1), width: 84 },
    { key: 'preOk', label: '前確OK', value: (r) => String(r.preOk) },
    { key: 'preOkRate', label: '前確OK通過率', value: (r) => (r.tossCount ? `${fixed(div(r.preOk, r.tossCount) * 100, 1)}%` : ''), width: 78 },
    { key: 'validPreOk', label: '有効前確OK', value: (r) => String(r.validPreOk) },
    { key: 'meetingDone', label: '商談実施', value: (r) => String(r.meetingDone) },
    { key: 'contractSites', label: '成約拠点', value: () => '' },
    { key: 'et', label: 'ET', value: (r) => String(r.et) },
    { key: 'reschedule', label: 'リスケ', value: (r) => String(r.reschedule) },
    { key: 'zenrenLost', label: '前連失注', value: (r) => String(r.zenrenLost) },
    { key: 'remainingVisit', label: '残訪問', value: (r) => String(r.remainingVisit) },
    { key: 'points', label: 'Pt', value: (r) => String(r.points) },
  ];
}

/** 部署の合計行(件数・時間は合計、率・人数・席数は合計値から計算し直す) */
function totalRow(rows: Row[]): Row {
  const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const budget: Record<string, string> = {};
  for (const b of BUDGETS) {
    const has = rows.some((r) => r.budget[b.key]);
    if (has) budget[b.key] = String(sum((r) => num(r.budget[b.key])));
  }
  return {
    userId: 'total',
    name: '合計',
    roles: [],
    workHours: sum((r) => r.workHours),
    calls: sum((r) => r.calls),
    tossCount: sum((r) => r.tossCount),
    preOk: sum((r) => r.preOk),
    validPreOk: sum((r) => r.validPreOk),
    meetingDone: sum((r) => r.meetingDone),
    et: sum((r) => r.et),
    reschedule: sum((r) => r.reschedule),
    zenrenLost: sum((r) => r.zenrenLost),
    remainingVisit: sum((r) => r.remainingVisit),
    points: sum((r) => r.points),
    budget,
  };
}

export function SummarySheetsPage() {
  const [period] = usePeriodMonth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['department-summary', period],
    queryFn: () => api.get<SummaryResponse>(`/department-summary?period=${period}`),
  });
  const [deptId, setDeptId] = useState<string | null>(null);
  const departments = data?.departments ?? [];
  const current = departments.find((d) => d.id === deptId) ?? departments[0];
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!deptId && departments[0]) setDeptId(departments[0].id);
  }, [deptId, departments]);

  const metrics = metricsFor();
  const copyTable = async () => {
    if (!current) return;
    const header = ['氏名', '役職', '部署', ...metrics.map((m) => m.label)];
    const lines = [...current.rows, totalRow(current.rows)].map((r) =>
      [r.name, roleLabel(r.roles), r.userId === 'total' ? '' : current.name, ...metrics.map((m) => m.value(r))].join('\t'),
    );
    const text = [header.join('\t'), ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      logCopy('サマリー(表のコピー)', text, { target: `${period} ${current.name}`, cells: lines.length });
      setToast('表をコピーしました(スプレッドシートに貼り付けできます)');
    } catch {
      setToast('コピーできませんでした');
    }
    window.setTimeout(() => setToast(null), 2000);
  };

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 'none' }}>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title">サマリー</h1>
            <MonthSwitcher />
          </div>
          <button type="button" onClick={() => void copyTable()} disabled={!current} style={{ fontSize: 12 }}>
            表をコピー
          </button>
        </div>

        {departments.length > 0 && (
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-border)', marginBottom: 8, overflowX: 'auto' }}>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeptId(d.id)}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  border: 'none',
                  boxShadow: 'none',
                  background: 'transparent',
                  whiteSpace: 'nowrap',
                  borderBottom: current?.id === d.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: current?.id === d.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                }}
              >
                {d.name}
              </button>
            ))}
          </div>
        )}

        {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>}
        {!isLoading && departments.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>表示できるアカウントがありません</p>}
        {current && <DepartmentTable period={period} deptName={current.name} rows={current.rows} metrics={metrics} />}
        {toast && <div className="chat-toast">{toast}</div>}
      </div>
    </AppLayout>
  );
}

function DepartmentTable({ period, deptName, rows, metrics }: { period: string; deptName: string; rows: Row[]; metrics: Metric[] }) {
  const total = totalRow(rows);
  const th: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    background: 'var(--color-subtle)',
    fontSize: 10.5,
    padding: '4px 6px',
    borderBottom: '1px solid var(--color-border-strong)',
    borderRight: '1px solid var(--color-border)',
    whiteSpace: 'normal',
    lineHeight: 1.25,
    textAlign: 'center',
  };
  const td: React.CSSProperties = { fontSize: 12, padding: '3px 6px', borderBottom: '1px solid var(--color-sunken)', borderRight: '1px solid var(--color-sunken)', whiteSpace: 'nowrap' };
  const sticky = (left: number, w: number, bg = 'var(--color-surface)'): React.CSSProperties => ({ position: 'sticky', left, zIndex: 1, background: bg, minWidth: w, maxWidth: w });

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(var(--viewport-height, 100vh) - 190px)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
        <thead>
          <tr>
            <th style={{ ...th, ...sticky(0, 96, 'var(--color-subtle)'), zIndex: 3 }}>氏名</th>
            <th style={{ ...th, minWidth: 64 }}>役職</th>
            <th style={{ ...th, minWidth: 56 }}>部署</th>
            {metrics.map((m) => (
              <th key={m.key} style={{ ...th, minWidth: m.width ?? 58, maxWidth: m.width ?? 70 }}>
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td style={{ ...td, ...sticky(0, 96) }}>{r.name}</td>
              <td style={td}>{roleLabel(r.roles)}</td>
              <td style={td}>{deptName}</td>
              {metrics.map((m) =>
                m.key.startsWith('budget.') ? (
                  <td key={m.key} style={{ ...td, padding: 0, background: '#fffdf2' }}>
                    <BudgetInput period={period} userId={r.userId} budgetKey={m.key.slice(7)} value={r.budget[m.key.slice(7)] ?? ''} />
                  </td>
                ) : (
                  <td key={m.key} style={{ ...td, textAlign: 'right' }}>
                    {m.value(r)}
                  </td>
                ),
              )}
            </tr>
          ))}
          <tr style={{ fontWeight: 900 }}>
            <td style={{ ...td, ...sticky(0, 96, 'var(--color-primary-soft)'), fontWeight: 900 }}>合計</td>
            <td style={{ ...td, background: 'var(--color-primary-soft)' }} />
            <td style={{ ...td, background: 'var(--color-primary-soft)' }}>{deptName}</td>
            {metrics.map((m) => (
              <td key={m.key} style={{ ...td, textAlign: 'right', background: 'var(--color-primary-soft)' }}>
                {m.value(total)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** 予算の手入力(要望: 予算は全て手入力)。欄を抜けたら保存 */
function BudgetInput({ period, userId, budgetKey, value }: { period: string; userId: string; budgetKey: string; value: string }) {
  const [draft, setDraft] = useState(value);
  const queryClient = useQueryClient();
  useEffect(() => setDraft(value), [value]);
  const save = useMutation({
    mutationFn: (v: string) => api.put('/department-summary/budget', { period, userId, key: budgetKey, value: v }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['department-summary', period] }),
    onError: (err) => {
      window.alert(err instanceof ApiError ? err.message : '予算を保存できませんでした');
      setDraft(value);
    },
  });
  return (
    <input
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && save.mutate(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      style={{ width: '100%', boxSizing: 'border-box', border: 'none', background: 'transparent', textAlign: 'right', fontSize: 12, padding: '3px 6px', boxShadow: 'none' }}
    />
  );
}
