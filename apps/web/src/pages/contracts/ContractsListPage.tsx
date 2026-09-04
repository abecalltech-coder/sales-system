import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate, InlineFlexTime } from '../../components/InlineEdit';
import { PresenceBar } from '../../components/PresenceBar';
import { useContracts, useStatuses, useMe, ContractListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateInput, isoToTimeInput, parseDateText, parseTimeText } from '../../lib/dateInput';
import { usePresence } from '../../lib/usePresence';
import { useManualSort } from '../../hooks/useManualSort';

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const inlineInputStyle = { border: 'none', background: 'transparent', font: 'inherit', color: 'inherit', width: '100%', padding: 0 } as const;

type FilterValueFn = (r: ContractListItem) => string;

export function ContractsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filters, setFilters] = useState<Record<string, Set<string> | null>>({});
  const pageSize = 100;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const manualSort = useManualSort('contracts', '/contracts/reorder', 'contracts');

  const { data, isLoading } = useContracts({ page, pageSize, statusId: statusId || undefined, keyword: keyword || undefined });
  const { data: me } = useMe();
  const presence = usePresence('CONTRACT', me?.id);
  const { data: statuses } = useStatuses('MATCHING');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/contracts/${vars.id}`, { version: vars.version, ...vars.patch }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });
  const save = (row: ContractListItem, patch: Record<string, unknown>) =>
    updateMutation.mutate({ id: row.id, version: row.version, patch });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post('/contracts/bulk-delete', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contracts'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '削除に失敗しました'),
  });

  const numberColumn = (key: keyof ContractListItem, label: string, width = 110): Column<ContractListItem> => ({
    key: key as string,
    label,
    width,
    renderHeader: filterHeaderFor(key as string, label),
    render: (r) => {
      const value = r[key] as string | null;
      return (
        <input
          type="text"
          inputMode="decimal"
          defaultValue={value ?? ''}
          onClick={stop}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const current = value ?? '';
            if (raw === current) return;
            if (raw === '') {
              save(r, { [key]: null });
              return;
            }
            const num = Number(raw);
            if (!Number.isFinite(num)) {
              setError(`${label}は数値で入力してください`);
              e.target.value = current;
              return;
            }
            save(r, { [key]: num });
          }}
          style={inlineInputStyle}
        />
      );
    },
    copyValue: (r) => (r[key] as string | null) ?? '',
    pasteValue: (r, text) => {
      const t = text.trim();
      if (!t) return save(r, { [key]: null });
      const num = Number(t.replace(/,/g, ''));
      if (Number.isFinite(num)) save(r, { [key]: num });
    },
  });

  const dateColumn = (colKey: string, isoField: keyof ContractListItem, label: string, width = 100): Column<ContractListItem> => ({
    key: colKey,
    label,
    width,
    renderHeader: filterHeaderFor(colKey, label),
    render: (r) => (
      <InlineFlexDate iso={r[isoField] as string | null} label={label} onSave={(iso) => save(r, { [isoField]: iso })} onInvalid={setError} />
    ),
    copyValue: (r) => isoToDateInput(r[isoField] as string | null),
    pasteValue: (r, text) => {
      const t = text.trim();
      if (!t) return save(r, { [isoField]: null });
      const p = parseDateText(t);
      if (p) save(r, { [isoField]: new Date(`${p}T${isoToTimeInput(r[isoField] as string | null) || '00:00'}`).toISOString() });
    },
  });

  const timeColumn = (colKey: string, isoField: keyof ContractListItem, label: string, width = 84): Column<ContractListItem> => ({
    key: colKey,
    label,
    width,
    renderHeader: filterHeaderFor(colKey, label),
    render: (r) => (
      <InlineFlexTime iso={r[isoField] as string | null} label={label} onSave={(iso) => save(r, { [isoField]: iso })} onInvalid={setError} />
    ),
    copyValue: (r) => isoToTimeInput(r[isoField] as string | null),
    pasteValue: (r, text) => {
      const p = parseTimeText(text.trim());
      if (p && r[isoField]) save(r, { [isoField]: new Date(`${isoToDateInput(r[isoField] as string | null)}T${p}`).toISOString() });
    },
  });

  const textColumn = (
    colKey: string,
    label: string,
    get: (r: ContractListItem) => string | null,
    patch: (v: string) => Record<string, unknown>,
    width = 140,
  ): Column<ContractListItem> => ({
    key: colKey,
    label,
    width,
    renderHeader: filterHeaderFor(colKey, label),
    render: (r) => <InlineText value={get(r)} onSave={(v) => save(r, patch(v))} />,
    copyValue: (r) => get(r) ?? '',
    pasteValue: (r, text) => save(r, patch(text)),
  });

  // 列フィルター(トス・アポと同仕様)。自分の画面だけのローカルstateで他ユーザーには共有しない。
  const filterValueFns: Record<string, FilterValueFn> = {
    caseNumber: (r) => r.caseNumber,
    storeName: (r) => r.storeName ?? '',
    contractedAt: (r) => isoToDateInput(r.contractedAt),
    contractAmount: (r) => r.contractAmount ?? '',
    revenueForecast: (r) => r.revenueForecast ?? '',
    feeForecast: (r) => r.feeForecast ?? '',
    contractNumber: (r) => r.contractNumber ?? '',
    applicationNumber: (r) => r.applicationNumber ?? '',
    status: (r) => statusLabel(r.matchingStatusId),
    matchingDate: (r) => isoToDateInput(r.matchingAt),
    matchingTime: (r) => isoToTimeInput(r.matchingAt),
    switchingScheduledAt: (r) => isoToDateInput(r.switchingScheduledAt),
    switchingDate: (r) => isoToDateInput(r.switchingAt),
    switchingTime: (r) => isoToTimeInput(r.switchingAt),
    cancelledDate: (r) => isoToDateInput(r.cancelledAt),
    cancelledTime: (r) => isoToTimeInput(r.cancelledAt),
    terminatedDate: (r) => isoToDateInput(r.terminatedAt),
    terminatedTime: (r) => isoToTimeInput(r.terminatedAt),
    deficiencyNote: (r) => r.deficiencyNote ?? '',
    nextActionAt: (r) => isoToDateInput(r.nextActionAt),
    memo: (r) => r.memo ?? '',
  };

  const rawRows = useMemo(() => data?.items ?? [], [data]);
  const optionsFor = (key: string) => {
    const fn = filterValueFns[key];
    if (!fn) return [];
    const set = new Set<string>();
    for (const r of rawRows) set.add(fn(r));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  };
  function filterHeaderFor(key: string, label: string) {
    return () => (
      <ColumnFilterHeader
        label={label}
        options={optionsFor(key)}
        selected={filters[key] ?? null}
        onChange={(sel) => setFilters((f) => ({ ...f, [key]: sel }))}
      />
    );
  }

  const rows = useMemo(() => {
    const filtered = rawRows.filter((r) =>
      Object.entries(filters).every(([key, sel]) => {
        if (!sel) return true;
        const fn = filterValueFns[key];
        return fn ? sel.has(fn(r)) : true;
      }),
    );
    return manualSort.manual ? manualSort.applySort(filtered) : filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, filters, manualSort.manual]);

  const columns: Column<ContractListItem>[] = [
    textColumn('storeName', '店舗名', (r) => r.storeName, (v) => ({ corporateName: v }), 160),
    dateColumn('contractedAt', 'contractedAt', '成約日', 92),
    numberColumn('contractAmount', '契約金額', 110),
    {
      key: 'status',
      label: 'マッチング状況',
      width: 140,
      renderHeader: filterHeaderFor('status', 'マッチング状況'),
      render: (r) => (
        <InlineSelect
          value={r.matchingStatusId}
          options={statuses?.map((s) => ({ id: s.id, label: s.displayName, color: s.color })) ?? []}
          onSave={(v) => save(r, { matchingStatusId: v })}
          colored
          style={{ borderRadius: 999, padding: '2px 6px', fontSize: 11, fontWeight: 600, textAlign: 'center' }}
        />
      ),
      copyValue: (r) => statusLabel(r.matchingStatusId),
      pasteValue: (r, text) => {
        const t = text.trim();
        const m = statuses?.find((s) => s.displayName === t || s.displayName.toLowerCase() === t.toLowerCase());
        if (m) save(r, { matchingStatusId: m.id });
      },
    },
    dateColumn('matchingDate', 'matchingAt', 'マッチング日', 92),
    timeColumn('matchingTime', 'matchingAt', 'マッチング時間'),
    dateColumn('switchingScheduledAt', 'switchingScheduledAt', 'スイッチング予定日', 110),
    dateColumn('switchingDate', 'switchingAt', 'スイッチング日', 100),
    timeColumn('switchingTime', 'switchingAt', 'スイッチング時間'),
    dateColumn('cancelledDate', 'cancelledAt', 'キャンセル日', 96),
    timeColumn('cancelledTime', 'cancelledAt', 'キャンセル時間'),
    dateColumn('terminatedDate', 'terminatedAt', '解約日', 92),
    timeColumn('terminatedTime', 'terminatedAt', '解約時間'),
    textColumn('contractNumber', '契約書番号', (r) => r.contractNumber, (v) => ({ contractNumber: v }), 110),
    textColumn('applicationNumber', '申込番号', (r) => r.applicationNumber, (v) => ({ applicationNumber: v }), 110),
    numberColumn('revenueForecast', '売上予測', 100),
    numberColumn('feeForecast', '手数料予測', 100),
    textColumn('deficiencyNote', '不備内容', (r) => r.deficiencyNote, (v) => ({ deficiencyNote: v }), 140),
    dateColumn('nextActionAt', 'nextActionAt', '次回対応日', 92),
    {
      ...textColumn('memo', '備考', (r) => r.memo, (v) => ({ memo: v }), 220),
      render: (r) => <InlineText value={r.memo} onSave={(v) => save(r, { memo: v })} expand />,
    },
  ];

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">エントリー管理</h1>
          <a href="/api/contracts/export" style={{ fontSize: 13 }}>
            CSV出力
          </a>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <PresenceBar viewers={presence.viewers} />

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="店舗名で検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13, width: 240 }}
          />
          <select
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13 }}
          >
            <option value="">すべてのマッチング状況</option>
            {statuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          {manualSort.manual && (
            <button onClick={manualSort.resetToAuto} style={{ fontSize: 12 }}>
              自動並びに戻す
            </button>
          )}
        </div>

        <DataTable
          tableKey="contracts"
          columns={columns}
          rows={rows}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
          onReorder={manualSort.reorder}
          onDeleteRows={(ids) => deleteMutation.mutate(ids)}
        />
      </div>
    </AppLayout>
  );
}
