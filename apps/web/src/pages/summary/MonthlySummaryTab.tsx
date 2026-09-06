import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataTable, Column } from '../../components/DataTable';
import { InlineNumber, InlineSelect, InlineText } from '../../components/InlineEdit';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { usePeriodMonth } from '../../lib/usePeriodMonth';
import {
  MonthlySummaryRow,
  useMonthlySummary,
  useMonthlySummaryDepartments,
  useUserOptions,
} from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const AUTO_CODES = new Set(['tossUp', 'apo', 'meetingDone', 'contractSites', 'etCount', 'reschedule']);

/** 行の値を解決(手入力 > 自動集計 > 0) */
function resolved(row: MonthlySummaryRow, code: string): number {
  const raw = row.values?.[code];
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  if (row.auto && code in row.auto) return row.auto[code];
  return 0;
}

interface Computed {
  totalCalls: number;
  dph: number | null;
  directRate: number | null;
  preOkRate: number | null;
  meetingRate: number | null;
  contractRate: number | null;
  rescheduleRate: number | null;
  preContactLostRate: number | null;
  remainingVisit: number;
}

function compute(get: (code: string) => number): Computed {
  const div = (a: number, b: number) => (b ? a / b : null);
  const totalCalls = get('sfCalls') + get('blankCalls');
  return {
    totalCalls,
    dph: div(totalCalls, get('workHours')),
    directRate: div(get('directToss'), get('tossUp')),
    preOkRate: div(get('preOk'), get('tossUp')),
    meetingRate: div(get('meetingDone'), get('apo')),
    contractRate: div(get('contractSites'), get('meetingDone')),
    rescheduleRate: div(get('reschedule'), get('apo')),
    preContactLostRate: div(get('preContactLost'), get('apo')),
    remainingVisit: Math.max(get('apo') - get('meetingDone') - get('preContactLost'), 0),
  };
}

const pct = (v: number | null) => (v == null ? '–' : `${(v * 100).toFixed(1)}%`);
const num = (v: number | null) => (v == null ? '–' : v.toLocaleString('ja-JP'));

const COMPUTED_RENDER: Record<string, (c: Computed) => string> = {
  totalCalls: (c) => num(c.totalCalls),
  dph: (c) => (c.dph == null ? '–' : c.dph.toFixed(1)),
  directRate: (c) => pct(c.directRate),
  preOkRate: (c) => pct(c.preOkRate),
  meetingRate: (c) => pct(c.meetingRate),
  contractRate: (c) => pct(c.contractRate),
  rescheduleRate: (c) => pct(c.rescheduleRate),
  preContactLostRate: (c) => pct(c.preContactLostRate),
  remainingVisit: (c) => num(c.remainingVisit),
};

export function MonthlySummaryTab() {
  const [periodMonth] = usePeriodMonth();
  const queryClient = useQueryClient();
  const { data: departments } = useMonthlySummaryDepartments();
  const [deptId, setDeptId] = useState<string | undefined>(undefined);
  const activeDept = deptId ?? departments?.[0]?.id;
  const { data, isLoading } = useMonthlySummary(periodMonth, activeDept);
  const { data: userOptions } = useUserOptions();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['monthly-summary'] });
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : '保存に失敗しました');

  const addRow = useMutation({
    mutationFn: (userId?: string) =>
      api.post('/monthly-summary/rows', { period: periodMonth, departmentId: activeDept, userId }),
    onSuccess: invalidate,
    onError: onErr,
  });
  const updateRow = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => api.patch(`/monthly-summary/rows/${v.id}`, v.patch),
    onSuccess: invalidate,
    onError: onErr,
  });
  const deleteRows = useMutation({
    mutationFn: (ids: string[]) => api.post('/monthly-summary/rows/bulk-delete', { ids }),
    onSuccess: invalidate,
    onError: onErr,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post('/monthly-summary/rows/reorder', { ids }),
    onSuccess: invalidate,
    onError: onErr,
  });

  const setVal = (row: MonthlySummaryRow, code: string, n: number | null) =>
    updateRow.mutate({ id: row.id, patch: { valuesPatch: { [code]: n } } });

  const rows = data?.rows ?? [];
  const cols = data?.columns ?? [];

  const columns: Column<MonthlySummaryRow>[] = useMemo(() => {
    const roleCol: Column<MonthlySummaryRow> = {
      key: 'role',
      label: '役割',
      width: 92,
      render: (r) => <InlineText value={r.role} onSave={(v) => updateRow.mutate({ id: r.id, patch: { role: v || null } })} />,
      copyValue: (r) => r.role ?? '',
      pasteValue: (r, t) => updateRow.mutate({ id: r.id, patch: { role: t || null } }),
    };
    const nameCol: Column<MonthlySummaryRow> = {
      key: 'userName',
      label: '名前',
      width: 104,
      render: (r) => (
        <InlineSelect
          value={r.userId}
          options={(userOptions ?? []).map((u) => ({ id: u.id, label: u.name }))}
          placeholder="(未割当)"
          onSave={(v) => updateRow.mutate({ id: r.id, patch: { userId: v || null } })}
        />
      ),
      copyValue: (r) => r.userName ?? '',
    };
    const deptCol: Column<MonthlySummaryRow> = {
      key: 'department',
      label: '部署',
      width: 72,
      render: (r) => {
        const own = data?.departmentId ? departments?.find((d) => d.id === data.departmentId)?.displayName : '';
        const v = (r.values?.department as string) ?? own ?? '';
        return (
          <InlineText
            value={v}
            onSave={(x) => updateRow.mutate({ id: r.id, patch: { valuesPatch: { department: x || null } } })}
          />
        );
      },
      copyValue: (r) => (r.values?.department as string) ?? '',
      pasteValue: (r, t) => updateRow.mutate({ id: r.id, patch: { valuesPatch: { department: t || null } } }),
    };

    const dataCols: Column<MonthlySummaryRow>[] = cols.map((c) => {
      if (c.kind === 'computed') {
        return {
          key: c.code,
          label: c.label,
          width: 76,
          render: (r) => {
            const cmp = compute((code) => resolved(r, code));
            return <span style={{ display: 'block', textAlign: 'right', color: 'var(--color-text-muted)' }}>{COMPUTED_RENDER[c.code]?.(cmp) ?? '–'}</span>;
          },
          copyValue: (r) => COMPUTED_RENDER[c.code]?.(compute((code) => resolved(r, code))) ?? '',
        } as Column<MonthlySummaryRow>;
      }
      const isAuto = c.kind === 'auto' || AUTO_CODES.has(c.code);
      return {
        key: c.code,
        label: c.label,
        width: isAuto ? 68 : 82,
        render: (r) => {
          const override = r.values?.[c.code];
          const overridden = isAuto && override != null && override !== '';
          const value = overridden ? Number(override) : isAuto ? r.auto?.[c.code] ?? 0 : (override != null && override !== '' ? Number(override) : null);
          return (
            <InlineNumber
              value={value}
              overridden={overridden}
              title={isAuto ? '自動集計値。数値を入れると上書き、空にすると自動値に戻ります' : undefined}
              onSave={(n) => setVal(r, c.code, n)}
            />
          );
        },
        copyValue: (r) => String(resolved(r, c.code)),
        pasteValue: (r, t) => {
          const n = Number(t.replace(/,/g, ''));
          setVal(r, c.code, t.trim() === '' ? null : Number.isFinite(n) ? n : null);
        },
      } as Column<MonthlySummaryRow>;
    });

    return [roleCol, nameCol, deptCol, ...dataCols];
  }, [cols, userOptions, departments, data?.departmentId]);

  // 合計行
  const totals = useMemo(() => {
    const sum = (code: string) => rows.reduce((a, r) => a + resolved(r, code), 0);
    const cmp = compute(sum);
    return { sum, cmp };
  }, [rows]);

  const footerRow = data ? (
    <>
      <td style={{ textAlign: 'center', fontSize: 9, color: 'var(--color-text-faint)' }}>Σ</td>
      <td style={{ padding: '3px 8px' }}>合計</td>
      <td />
      <td />
      {cols.map((c) => {
        let text = '';
        if (c.kind === 'computed') text = COMPUTED_RENDER[c.code]?.(totals.cmp) ?? '';
        else text = totals.sum(c.code).toLocaleString('ja-JP');
        return (
          <td key={c.code} style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {text}
          </td>
        );
      })}
    </>
  ) : undefined;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <MonthSwitcher />
        <div style={{ display: 'flex', gap: 2 }}>
          {departments?.map((d) => (
            <button
              key={d.id}
              onClick={() => setDeptId(d.id)}
              style={{
                fontSize: 12,
                padding: '4px 12px',
                border: 'none',
                borderRadius: 999,
                fontWeight: activeDept === d.id ? 700 : 500,
                background: activeDept === d.id ? 'var(--color-primary-soft)' : 'transparent',
                color: activeDept === d.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              {d.displayName}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) addRow.mutate(e.target.value);
              e.target.value = '';
            }}
            style={{ fontSize: 12 }}
          >
            <option value="">＋ ユーザーを追加</option>
            {userOptions?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button className="btn-sm" onClick={() => addRow.mutate(undefined)}>
            ＋ 空行
          </button>
        </div>
      </div>

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <DataTable
        tableKey={`monthly-summary:${activeDept}`}
        columns={columns}
        rows={rows}
        total={rows.length}
        page={1}
        pageSize={rows.length || 1}
        loading={isLoading}
        onPageChange={() => {}}
        getRowId={(r) => r.id}
        onReorder={(ids) => reorder.mutate(ids)}
        onDeleteRows={(ids) => deleteRows.mutate(ids)}
        footerRow={footerRow}
      />
      <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 8, lineHeight: 1.6 }}>
        「トスアップ・アポ・商談実施数・成約拠点数・ET数・リスケ」はトス/アポ/エントリー実績から自動集計します(青字は手入力の上書き。セルを空にすると自動値に戻ります)。
        予算・コール数・稼働時間・席数・前確OK・直転送トス・前連失注は手入力です。比率・合計・DPH・残訪問は自動計算です。
      </p>
    </div>
  );
}
