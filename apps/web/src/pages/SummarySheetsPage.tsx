import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { usePeriodMonth } from '../lib/usePeriodMonth';
import { api, ApiError } from '../lib/api';
import { logCopy } from '../lib/copyLog';
import { useMe } from '../hooks/useApi';

/**
 * 役割別数値(旧「サマリー」。要望: 名称変更)。
 * 1画面に上から 前確数値関連 → クローザー数値関連 → 部署ごとのアポインター数値関連 を並べる。
 * 算出方法が決まっていない列は空欄(指示があり次第埋める)。集計の定義は API department-summary.module.ts を参照。
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
  preConfirmers: { id: string; name: string; departmentName: string; tossCount: number; preOk: number; reschedule: number; zenrenLost: number }[];
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
  { key: 'tossUp', label: 'トスアップ予算' },
  { key: 'preOk', label: '前確OK予算' },
  { key: 'meeting', label: '商談実施数予算' },
  { key: 'contractSites', label: '成約拠点数予算' },
  { key: 'et', label: 'ET数予算' },
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
    { key: 'callSf', label: 'SFコール数', value: () => '' },
    { key: 'callBlank', label: '白地コール数', value: () => '' },
    { key: 'calls', label: '合計コール数', value: (r) => String(r.calls) },
    { key: 'dph', label: 'DPH※1時間あたり', value: (r) => fixed(div(r.calls, r.workHours), 1), width: 84 },
    { key: 'tossUp', label: 'トスアップ', value: (r) => String(r.tossCount) },
    { key: 'preOk', label: '前確OK', value: (r) => String(r.preOk) },
    { key: 'preOkRate', label: '前確OK通過率', value: (r) => (r.tossCount ? `${fixed(div(r.preOk, r.tossCount) * 100, 1)}%` : ''), width: 78 },
    { key: 'appo', label: 'アポ', value: () => '' },
    { key: 'meetingDone', label: '商談実施数', value: (r) => String(r.meetingDone) },
    { key: 'contractSites', label: '成約拠点数', value: () => '' },
    { key: 'et', label: 'ET数', value: (r) => String(r.et) },
    { key: 'reschedule', label: 'リスケ', value: (r) => String(r.reschedule) },
    { key: 'zenrenLost', label: '前連失注', value: (r) => String(r.zenrenLost) },
    { key: 'remainingVisit', label: '残訪問', value: (r) => String(r.remainingVisit) },
    { key: 'points', label: 'pt数', value: (r) => String(r.points) },
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
  const { data: me } = useMe();
  // 登録しているアカウント全員(該当者の選択に出す)
  const accounts = (data?.departments ?? []).flatMap((d) => d.rows.map((r) => ({ ...r, deptName: d.name })));
  const normName = (s: string) => s.normalize('NFKC').replace(/\s+/g, '');
  // 前確・クローザーに出すアカウントの選択(要望: 変更するまではその表示のまま。見る人ごとにこの端末へ保存)。未選択のうちは 前確=マスタの前確担当者と同名のアカウント / クローザー=役職CL
  const preDefault = accounts.filter((a) => (data?.preConfirmers ?? []).some((p) => normName(p.name) === normName(a.name))).map((a) => a.userId);
  const clDefault = accounts.filter((a) => a.roles.includes('CL')).map((a) => a.userId);
  const [prePick, setPrePick] = useStoredPick(`roleStats.pick.pre:${me?.id ?? ''}`);
  const [clPick, setClPick] = useStoredPick(`roleStats.pick.cl:${me?.id ?? ''}`);
  const preIds = prePick ?? preDefault;
  const clIds = clPick ?? clDefault;
  const preRows: PreRow[] = accounts
    .filter((a) => preIds.includes(a.userId))
    .map((a) => {
      const p = (data?.preConfirmers ?? []).find((x) => normName(x.name) === normName(a.name));
      return { id: a.userId, name: a.name, departmentName: a.deptName === '所属なし' ? '' : a.deptName, tossCount: p?.tossCount ?? 0, preOk: p?.preOk ?? 0, reschedule: p?.reschedule ?? 0, zenrenLost: p?.zenrenLost ?? 0 };
    });
  const clRows: ClRow[] = accounts.filter((a) => clIds.includes(a.userId));

  const copyDepartment = async (dept: { name: string; rows: Row[] }) => {
    const header = ['氏名', '役職', '部署', ...metrics.map((m) => m.label)];
    const lines = [...dept.rows, totalRow(dept.rows)].map((r) =>
      [r.name, roleLabel(r.roles), r.userId === 'total' ? '' : dept.name, ...metrics.map((m) => m.value(r))].join('\t'),
    );
    const text = [header.join('\t'), ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      logCopy('役割別数値(表のコピー)', text, { target: `${period} ${dept.name}`, cells: lines.length });
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
            <h1 className="page-title">役割別数値</h1>
            <MonthSwitcher />
          </div>
        </div>

        {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error instanceof ApiError ? error.message : '読み込めませんでした'}</p>}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 上から 前確 → CL → 部署ごとのAP(要望)。算出方法が未定の列は空欄 */}
            <SummarySection title="■前確数値関連">
              <PickButton title="前確の該当者の選択" accounts={accounts} selected={preIds} onConfirm={setPrePick} />
              <PreConfirmTable rows={preRows} />
            </SummarySection>

            <SummarySection title="■クローザー数値関連">
              <PickButton title="クローザーの該当者の選択" accounts={accounts} selected={clIds} onConfirm={setClPick} />
              <CloserTable rows={clRows} />
            </SummarySection>

            {apDepartments.length === 0 && (
              <SummarySection title="■アポインター数値関連">
                <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>役職がAPのアカウントがありません</p>
              </SummarySection>
            )}
            {apDepartments.map((d) => (
              <SummarySection
                key={d.id}
                title={`■${d.name} アポインター数値関連`}
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

type Col<T> = { label: string; get: (r: T) => string; left?: boolean };

/** 画像の表の形(濃紺の見出し・ALL行は黄色)で出す共通の表。値が決まっていない列は get が '' を返す */
function FlatTable<T>({ cols, rows, total, totalLabel, empty }: { cols: Col<T>[]; rows: { key: string; row: T }[]; total: T; totalLabel: string; empty: string }) {
  if (rows.length === 0) return <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>{empty}</p>;
  const th: React.CSSProperties = { background: '#1f3864', color: '#fff', fontSize: 10.5, padding: '5px 6px', borderRight: '1px solid #4a5f8c', lineHeight: 1.25, textAlign: 'center', whiteSpace: 'normal', minWidth: 54 };
  const td: React.CSSProperties = { fontSize: 12, padding: '4px 6px', borderBottom: '1px solid var(--color-sunken)', borderRight: '1px solid var(--color-sunken)', whiteSpace: 'nowrap', textAlign: 'center' };
  const yellow = '#fff94d';
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.label} style={th}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {cols.map((c) => (
                <td key={c.label} style={td}>
                  {c.get(r.row)}
                </td>
              ))}
            </tr>
          ))}
          <tr style={{ fontWeight: 900 }}>
            {cols.map((c, i) => (
              <td key={c.label} style={{ ...td, background: yellow }}>
                {i === 1 ? totalLabel : i < 3 ? '' : c.get(total)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const pct = (a: number, b: number) => (b ? `${fixed((a / b) * 100, 1)}%` : '');

type PreRow = SummaryResponse['preConfirmers'][number];

/** 前確数値関連。ランク・対象外数・OK後対応数・成約法人など算出方法が未定の列は空欄 */
function PreConfirmTable({ rows }: { rows: PreRow[] }) {
  const sum = (f: (r: PreRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const total: PreRow = { id: 'all', name: 'ALL', departmentName: '', tossCount: sum((r) => r.tossCount), preOk: sum((r) => r.preOk), reschedule: sum((r) => r.reschedule), zenrenLost: sum((r) => r.zenrenLost) };
  const blank = () => '';
  const cols: Col<PreRow>[] = [
    { label: 'ランク', get: blank },
    { label: '前確担当', get: (r) => r.name },
    { label: '部署', get: (r) => r.departmentName },
    { label: '前確対応数', get: (r) => String(r.tossCount) },
    { label: '前確OK', get: (r) => String(r.preOk) },
    { label: '対象外数', get: blank },
    { label: 'OK後対応数', get: blank },
    { label: '前確通過率', get: (r) => pct(r.preOk, r.tossCount) },
    { label: 'リスケ', get: (r) => String(r.reschedule) },
    { label: '前連失注', get: (r) => String(r.zenrenLost) },
    { label: 'リスケ・前失合計', get: (r) => String(r.reschedule + r.zenrenLost) },
    { label: 'リスケ・前失率', get: blank },
    { label: '成約法人数', get: blank },
    { label: '前確OKに対しての法人成約率', get: blank },
    { label: '成約拠点数', get: blank },
    { label: '複数拠点比率', get: blank },
    { label: '保留A法人数', get: blank },
    { label: '保留B法人数', get: blank },
    { label: '評価', get: blank },
  ];
  return <FlatTable cols={cols} rows={rows.map((r) => ({ key: r.id, row: r }))} total={total} totalLabel="ALL" empty="該当者が選ばれていません(上の「該当者の選択」から選んでください)" />;
}

type ClRow = Row & { deptName: string };

/** クローザー数値関連(役職がCLのアカウント)。予算・成約・率などは算出方法が未定のため空欄 */
function CloserTable({ rows }: { rows: ClRow[] }) {
  const blank = () => '';
  const total = totalRow(rows) as ClRow;
  const cols: Col<ClRow>[] = [
    { label: 'ランク', get: blank },
    { label: 'CL担当', get: (r) => r.name },
    { label: '部署', get: (r) => r.deptName },
    { label: '法人成約数予算', get: blank },
    { label: '成約拠点数予算', get: blank },
    { label: '複数拠点比率予算', get: blank },
    { label: '訪問数', get: (r) => String(r.meetingDone) },
    { label: '成約法人数', get: blank },
    { label: '成約拠点数', get: blank },
    { label: '成約拠点数進捗', get: blank },
    { label: '法人成約率', get: blank },
    { label: '複数拠点比率', get: blank },
    { label: '即決率', get: blank },
    { label: '案件決着率', get: blank },
    { label: 'pt数', get: (r) => String(r.points) },
    { label: '保留A法人数', get: blank },
    { label: '保留B法人数', get: blank },
    { label: '失注・月内失注法人数', get: blank },
    { label: '取次不可法人数', get: blank },
    { label: '手書き明細使用数', get: blank },
    { label: '手書き明細使用率', get: blank },
    { label: 'CL評価', get: blank },
  ];
  return <FlatTable cols={cols} rows={rows.map((r) => ({ key: r.userId, row: r }))} total={total} totalLabel="ALL" empty="該当者が選ばれていません(上の「該当者の選択」から選んでください)" />;
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
            <td style={{ ...td, ...sticky(0, 96, 'var(--color-primary-soft)'), fontWeight: 900 }}>ALL</td>
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


/** 選んだアカウントの保存(この端末。null=未選択でそのまま既定の表示) */
function useStoredPick(key: string): [string[] | null, (ids: string[]) => void] {
  const read = () => {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as string[]) : null;
    } catch {
      return null;
    }
  };
  const [ids, setIds] = useState<string[] | null>(read);
  useEffect(() => setIds(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [
    ids,
    (next) => {
      setIds(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 保存できなくても表示は切り替わる */
      }
    },
  ];
}

/** 「該当者の選択」ボタン: 押すと登録しているアカウントをチェックボックスで出し、確定で表示を切り替える */
function PickButton({ title, accounts, selected, onConfirm }: { title: string; accounts: { userId: string; name: string; deptName: string }[]; selected: string[]; onConfirm: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const [q, setQ] = useState('');
  const shown = accounts.filter((a) => !q.trim() || a.name.includes(q.trim()) || a.deptName.includes(q.trim()));
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  return (
    <>
      <div style={{ marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => {
            setDraft(selected);
            setQ('');
            setOpen(true);
          }}
          style={{ fontSize: 12, padding: '3px 12px' }}
        >
          該当者の選択({selected.length}人)
        </button>
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '92vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{title}</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前・部署で絞り込み" style={{ flex: 1, fontSize: 12 }} />
              <button type="button" style={{ fontSize: 11 }} onClick={() => setDraft((d) => [...new Set([...d, ...shown.map((a) => a.userId)])])}>
                全て選ぶ
              </button>
              <button type="button" style={{ fontSize: 11 }} onClick={() => setDraft((d) => d.filter((id) => !shown.some((a) => a.userId === id)))}>
                全て外す
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--color-border)', borderRadius: 8 }}>
              {shown.map((a) => (
                <label key={a.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, borderBottom: '1px solid var(--color-sunken)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={draft.includes(a.userId)} onChange={() => toggle(a.userId)} />
                  <span style={{ flex: 1 }}>{a.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{a.deptName}</span>
                </label>
              ))}
              {shown.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)', padding: 10, margin: 0 }}>該当するアカウントがありません</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button type="button" onClick={() => setOpen(false)}>
                キャンセル
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onConfirm(accounts.filter((a) => draft.includes(a.userId)).map((a) => a.userId));
                  setOpen(false);
                }}
              >
                確定({draft.length}人)
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
