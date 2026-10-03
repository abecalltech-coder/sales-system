import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { usePeriodMonth } from '../lib/usePeriodMonth';
import { api, ApiError } from '../lib/api';
import { logCopy } from '../lib/copyLog';

/**
 * サマリー(要望: アプリで作るのではなくこちらで作成。旧「実績/フリーシート/カスタムレポート」は廃止)。
 * 1画面に上から 前確者サマリー → CLサマリー → 部署ごとのAPサマリー を並べる(前確者・CLは枠のみ)。集計の定義は API department-summary.module.ts を参照。
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
  preConfirmers: { id: string; name: string }[];
  departments: { id: string; name: string; rows: Row[] }[];
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'システム管理者',
  GENERAL_RESPONSIBLE: '統括責任者',
  RESPONSIBLE: '部署責任者',
  AP_LEADER: 'APリーダー',
  CL: 'CL',
  AP: 'AP',
};
const ROLE_ORDER = ['SUPER_ADMIN', 'GENERAL_RESPONSIBLE', 'RESPONSIBLE', 'AP_LEADER', 'CL', 'AP'];
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

/** AP として部署別サマリーに載せる役職 */
const AP_ROLES = ['AP', 'AP_LEADER'];

export function SummarySheetsPage() {
  const [period] = usePeriodMonth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['department-summary', period],
    queryFn: () => api.get<SummaryResponse>(`/department-summary?period=${period}`),
  });
  const [toast, setToast] = useState<string | null>(null);
  const metrics = metricsFor();

  // 部署ごとのサマリーは各部署のAPだけ(要望)
  // APがまだいない部署も枠を出す(要望: CHのAPサマリーが無い)
  const apDepartments = (data?.departments ?? [])
    .map((d) => ({ ...d, rows: d.rows.filter((r) => r.roles.some((c) => AP_ROLES.includes(c))) }))
    .filter((d) => d.id !== 'none' || d.rows.length > 0);
  // CLだけのサマリー(全部署)
  const clRows = (data?.departments ?? []).flatMap((d) => d.rows.filter((r) => r.roles.includes('CL')).map((r) => ({ ...r, deptName: d.name })));
  const preConfirmers = data?.preConfirmers ?? [];

  const copyDepartment = async (dept: { name: string; rows: Row[] }) => {
    const header = ['氏名', '役職', '部署', ...metrics.map((m) => m.label)];
    const lines = [...dept.rows, totalRow(dept.rows)].map((r) =>
      [r.name, roleLabel(r.roles), r.userId === 'total' ? '' : dept.name, ...metrics.map((m) => m.value(r))].join('\t'),
    );
    const text = [header.join('\t'), ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      logCopy('サマリー(表のコピー)', text, { target: `${period} ${dept.name}`, cells: lines.length });
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
        </div>

        {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 上から 前確者 → CL → 部署ごとのAP(要望)。前確者・CLは列が決まるまで枠のみ */}
            <SummarySection title="前確者サマリー" note="列の内容は今後決めます(枠のみ)">
              <NameOnlyTable names={preConfirmers.map((p) => ({ key: p.id, name: p.name }))} empty="マスタ管理の「前確担当者」が登録されていません" />
            </SummarySection>

            <SummarySection title="CLサマリー" note="列の内容は今後決めます(枠のみ)">
              <NameOnlyTable
                names={clRows.map((r) => ({ key: r.userId, name: r.name, sub: r.deptName }))}
                subLabel="部署"
                empty="役職がCLのアカウントがありません"
              />
            </SummarySection>

            {apDepartments.length === 0 && (
              <SummarySection title="APサマリー">
                <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>役職がAPのアカウントがありません</p>
              </SummarySection>
            )}
            {apDepartments.map((d) => (
              <SummarySection
                key={d.id}
                title={`${d.name} APサマリー`}
                actions={
                  <button type="button" onClick={() => void copyDepartment(d)} style={{ fontSize: 11, padding: '2px 10px' }}>
                    表をコピー
                  </button>
                }
              >
                {d.rows.length > 0 ? (
                  <DepartmentTable period={period} deptName={d.name} rows={d.rows} metrics={metrics} />
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0, padding: '8px 10px', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    この部署に所属する役職AP(APリーダー)のアカウントがまだありません。ユーザー管理で「所属」と「役職」を設定すると表示されます。
                  </p>
                )}
              </SummarySection>
            ))}
          </div>
        )}
        {toast && <div className="chat-toast">{toast}</div>}
      </div>
    </AppLayout>
  );
}

function SummarySection({ title, note, actions, children }: { title: string; note?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 900 }}>{title}</h2>
        {note && <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{note}</span>}
        <span style={{ flex: 1 }} />
        {actions}
      </div>
      {children}
    </section>
  );
}

/** 列が未定のサマリーの枠: 氏名(と部署)だけの表 */
function NameOnlyTable({ names, subLabel, empty }: { names: { key: string; name: string; sub?: string }[]; subLabel?: string; empty: string }) {
  const th: React.CSSProperties = { background: 'var(--color-subtle)', fontSize: 10.5, padding: '4px 8px', borderBottom: '1px solid var(--color-border-strong)', borderRight: '1px solid var(--color-border)', textAlign: 'left' };
  const td: React.CSSProperties = { fontSize: 12, padding: '3px 8px', borderBottom: '1px solid var(--color-sunken)', borderRight: '1px solid var(--color-sunken)', whiteSpace: 'nowrap' };
  if (names.length === 0) return <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>{empty}</p>;
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 120 }}>氏名</th>
            {subLabel && <th style={{ ...th, width: 80 }}>{subLabel}</th>}
            <th style={{ ...th, color: 'var(--color-text-faint)', fontWeight: 500 }}>(列は未設定)</th>
          </tr>
        </thead>
        <tbody>
          {names.map((n) => (
            <tr key={n.key}>
              <td style={td}>{n.name}</td>
              {subLabel && <td style={td}>{n.sub ?? ''}</td>}
              <td style={td} />
            </tr>
          ))}
          <tr style={{ fontWeight: 900 }}>
            <td style={{ ...td, background: 'var(--color-primary-soft)' }}>合計</td>
            {subLabel && <td style={{ ...td, background: 'var(--color-primary-soft)' }} />}
            <td style={{ ...td, background: 'var(--color-primary-soft)' }} />
          </tr>
        </tbody>
      </table>
    </div>
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
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
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
