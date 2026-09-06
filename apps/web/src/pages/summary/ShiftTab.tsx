import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataTable, Column } from '../../components/DataTable';
import { InlineNumber, InlineSelect, InlineText } from '../../components/InlineEdit';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { usePeriodMonth } from '../../lib/usePeriodMonth';
import { MonthlyShiftRow, useMonthlyShift, useUserOptions } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const NUMERIC_ATTRS = new Set(['cost', 'cumulativeHours', 'seats']);

function weekdayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

const sumDays = (r: MonthlyShiftRow) => Object.values(r.days ?? {}).reduce((a, b) => a + (Number(b) || 0), 0);
const workedDays = (r: MonthlyShiftRow) => Object.values(r.days ?? {}).filter((v) => Number(v) > 0).length;

export function ShiftTab() {
  const [periodMonth] = usePeriodMonth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useMonthlyShift(periodMonth);
  const { data: userOptions } = useUserOptions();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['monthly-shift'] });
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : '保存に失敗しました');

  const addRow = useMutation({
    mutationFn: (userId?: string) => api.post('/monthly-shift/rows', { period: periodMonth, userId }),
    onSuccess: invalidate,
    onError: onErr,
  });
  const updateRow = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => api.patch(`/monthly-shift/rows/${v.id}`, v.patch),
    onSuccess: invalidate,
    onError: onErr,
  });
  const deleteRows = useMutation({
    mutationFn: (ids: string[]) => api.post('/monthly-shift/rows/bulk-delete', { ids }),
    onSuccess: invalidate,
    onError: onErr,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) => api.post('/monthly-shift/rows/reorder', { ids }),
    onSuccess: invalidate,
    onError: onErr,
  });

  const setAttr = (r: MonthlyShiftRow, code: string, v: unknown) =>
    updateRow.mutate({ id: r.id, patch: { attributesPatch: { [code]: v === '' ? null : v } } });
  const setDay = (r: MonthlyShiftRow, dateKey: string, n: number | null) =>
    updateRow.mutate({ id: r.id, patch: { daysPatch: { [dateKey]: n } } });

  const rows = data?.rows ?? [];
  const days = data?.days ?? [];
  const attributeDefs = data?.attributeDefs ?? [];

  const columns: Column<MonthlyShiftRow>[] = useMemo(() => {
    const attrValue = (r: MonthlyShiftRow, code: string) => {
      const v = r.attributes?.[code];
      return v == null ? '' : String(v);
    };

    const cols: Column<MonthlyShiftRow>[] = [
      { key: 'no', label: 'No.', width: 40, render: (r) => <span style={{ color: 'var(--color-text-faint)' }}>{r.no}</span> },
    ];

    for (const def of attributeDefs) {
      if (def.code === 'cumulativeHours') {
        cols.push({
          key: def.code,
          label: def.label,
          width: 66,
          render: (r) => (
            <InlineNumber
              value={r.attributes?.cumulativeHours != null ? Number(r.attributes.cumulativeHours) : null}
              onSave={(n) => setAttr(r, 'cumulativeHours', n)}
            />
          ),
          copyValue: (r) => attrValue(r, def.code),
        });
        // 累計時間の直後に「稼働人数(自動)」を差し込む
        cols.push({
          key: '_workedDays',
          label: '稼働人数',
          width: 62,
          render: (r) => (
            <span style={{ display: 'block', textAlign: 'right', color: 'var(--color-text-muted)' }}>{workedDays(r)}</span>
          ),
          copyValue: (r) => String(workedDays(r)),
        });
        continue;
      }
      const numeric = NUMERIC_ATTRS.has(def.code);
      cols.push({
        key: def.code,
        label: def.label,
        width: numeric ? 60 : 88,
        render: (r) =>
          numeric ? (
            <InlineNumber
              value={r.attributes?.[def.code] != null ? Number(r.attributes[def.code]) : null}
              onSave={(n) => setAttr(r, def.code, n)}
            />
          ) : (
            <InlineText value={attrValue(r, def.code)} onSave={(v) => setAttr(r, def.code, v)} />
          ),
        copyValue: (r) => attrValue(r, def.code),
        pasteValue: (r, t) => setAttr(r, def.code, numeric ? Number(t.replace(/,/g, '')) || null : t),
      });
    }

    // 氏名(userId 選択)を役職の直後に入れたいが、attributeDefs に氏名は無いので先頭付近へ差し込む
    cols.splice(2, 0, {
      key: 'userName',
      label: '氏名',
      width: 100,
      render: (r) => (
        <InlineSelect
          value={r.userId}
          options={(userOptions ?? []).map((u) => ({ id: u.id, label: u.name }))}
          placeholder="(未割当)"
          onSave={(v) => updateRow.mutate({ id: r.id, patch: { userId: v || null } })}
        />
      ),
      copyValue: (r) => r.userName ?? '',
    });

    // 日別列
    for (const dateKey of days) {
      const [, m, d] = dateKey.split('-');
      const wd = weekdayOf(dateKey);
      const weekend = wd === '土' || wd === '日';
      cols.push({
        key: `day:${dateKey}`,
        label: `${Number(m)}/${Number(d)}`,
        width: 34,
        renderHeader: () => (
          <div style={{ textAlign: 'center', lineHeight: 1.15 }}>
            <div>{`${Number(m)}/${Number(d)}`}</div>
            <div style={{ fontSize: 9, color: weekend ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>{wd}</div>
          </div>
        ),
        render: (r) => (
          <InlineNumber value={r.days?.[dateKey] ?? null} align="center" onSave={(n) => setDay(r, dateKey, n)} />
        ),
        copyValue: (r) => String(r.days?.[dateKey] ?? ''),
        pasteValue: (r, t) => {
          const n = Number(t.replace(/,/g, ''));
          setDay(r, dateKey, t.trim() === '' ? null : Number.isFinite(n) ? n : null);
        },
      });
    }

    // 実稼働時間(自動)
    cols.push({
      key: '_actualHours',
      label: '実稼働時間',
      width: 72,
      render: (r) => (
        <span style={{ display: 'block', textAlign: 'right', fontWeight: 700 }}>{sumDays(r).toLocaleString('ja-JP')}</span>
      ),
      copyValue: (r) => String(sumDays(r)),
    });

    return cols;
  }, [attributeDefs, days, userOptions]);

  const footerRow = data ? (
    <>
      <td style={{ textAlign: 'center', fontSize: 9, color: 'var(--color-text-faint)' }}>Σ</td>
      {columns.map((c) => {
        if (c.key === 'no') return <td key="no" style={{ padding: '3px 8px' }}>合計</td>;
        if (c.key === '_actualHours')
          return (
            <td key={c.key} style={{ padding: '3px 8px', textAlign: 'right' }}>
              {rows.reduce((a, r) => a + sumDays(r), 0).toLocaleString('ja-JP')}
            </td>
          );
        if (c.key === '_workedDays')
          return (
            <td key={c.key} style={{ padding: '3px 8px', textAlign: 'right' }}>
              {rows.reduce((a, r) => a + workedDays(r), 0)}
            </td>
          );
        if (c.key.startsWith('day:')) {
          const dateKey = c.key.slice(4);
          const total = rows.reduce((a, r) => a + (Number(r.days?.[dateKey]) || 0), 0);
          return (
            <td key={c.key} style={{ padding: '3px 2px', textAlign: 'center', fontSize: 10 }}>
              {total || ''}
            </td>
          );
        }
        return <td key={c.key} />;
      })}
    </>
  ) : undefined;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <MonthSwitcher />
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
        tableKey="monthly-shift"
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
      <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 8 }}>
        日別セルに稼働時間数(例: 8 / 0)を入力すると、稼働人数・実稼働時間・各列の合計が自動計算されます。月を切り替えると日数・曜日が自動で変わります。
      </p>
    </div>
  );
}
