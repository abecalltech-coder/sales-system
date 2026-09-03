import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { ColumnFilterHeader } from '../../components/ColumnFilterHeader';
import { InlineText, InlineSelect, InlineFlexDate, InlineFlexTime } from '../../components/InlineEdit';
import { PresenceBar } from '../../components/PresenceBar';
import { useContracts, useStatuses, useMe, ContractListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { isoToDateInput, isoToTimeInput } from '../../lib/dateInput';
import { usePresence } from '../../lib/usePresence';

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

  const rows = useMemo(
    () =>
      rawRows.filter((r) =>
        Object.entries(filters).every(([key, sel]) => {
          if (!sel) return true;
          const fn = filterValueFns[key];
          return fn ? sel.has(fn(r)) : true;
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawRows, filters],
  );

  const columns: Column<ContractListItem>[] = [
    {
      key: 'storeName',
      label: '店舗名',
      width: 160,
      renderHeader: filterHeaderFor('storeName', '店舗名'),
      render: (r) => <InlineText value={r.storeName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    {
      key: 'contractedAt',
      label: '成約日',
      width: 92,
      renderHeader: filterHeaderFor('contractedAt', '成約日'),
      render: (r) => <InlineFlexDate iso={r.contractedAt} label="成約日" onSave={(iso) => save(r, { contractedAt: iso })} onInvalid={setError} />,
    },
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
    },
    {
      key: 'matchingDate',
      label: 'マッチング日',
      width: 92,
      renderHeader: filterHeaderFor('matchingDate', 'マッチング日'),
      render: (r) => <InlineFlexDate iso={r.matchingAt} label="マッチング日" onSave={(iso) => save(r, { matchingAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'matchingTime',
      label: 'マッチング時間',
      width: 84,
      renderHeader: filterHeaderFor('matchingTime', 'マッチング時間'),
      render: (r) => <InlineFlexTime iso={r.matchingAt} label="マッチング時間" onSave={(iso) => save(r, { matchingAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'switchingScheduledAt',
      label: 'スイッチング予定日',
      width: 110,
      renderHeader: filterHeaderFor('switchingScheduledAt', 'スイッチング予定日'),
      render: (r) => (
        <InlineFlexDate iso={r.switchingScheduledAt} label="スイッチング予定日" onSave={(iso) => save(r, { switchingScheduledAt: iso })} onInvalid={setError} />
      ),
    },
    {
      key: 'switchingDate',
      label: 'スイッチング日',
      width: 100,
      renderHeader: filterHeaderFor('switchingDate', 'スイッチング日'),
      render: (r) => <InlineFlexDate iso={r.switchingAt} label="スイッチング日" onSave={(iso) => save(r, { switchingAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'switchingTime',
      label: 'スイッチング時間',
      width: 84,
      renderHeader: filterHeaderFor('switchingTime', 'スイッチング時間'),
      render: (r) => <InlineFlexTime iso={r.switchingAt} label="スイッチング時間" onSave={(iso) => save(r, { switchingAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'cancelledDate',
      label: 'キャンセル日',
      width: 96,
      renderHeader: filterHeaderFor('cancelledDate', 'キャンセル日'),
      render: (r) => <InlineFlexDate iso={r.cancelledAt} label="キャンセル日" onSave={(iso) => save(r, { cancelledAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'cancelledTime',
      label: 'キャンセル時間',
      width: 84,
      renderHeader: filterHeaderFor('cancelledTime', 'キャンセル時間'),
      render: (r) => <InlineFlexTime iso={r.cancelledAt} label="キャンセル時間" onSave={(iso) => save(r, { cancelledAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'terminatedDate',
      label: '解約日',
      width: 92,
      renderHeader: filterHeaderFor('terminatedDate', '解約日'),
      render: (r) => <InlineFlexDate iso={r.terminatedAt} label="解約日" onSave={(iso) => save(r, { terminatedAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'terminatedTime',
      label: '解約時間',
      width: 84,
      renderHeader: filterHeaderFor('terminatedTime', '解約時間'),
      render: (r) => <InlineFlexTime iso={r.terminatedAt} label="解約時間" onSave={(iso) => save(r, { terminatedAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'contractNumber',
      label: '契約書番号',
      width: 110,
      renderHeader: filterHeaderFor('contractNumber', '契約書番号'),
      render: (r) => <InlineText value={r.contractNumber} onSave={(v) => save(r, { contractNumber: v })} />,
    },
    {
      key: 'applicationNumber',
      label: '申込番号',
      width: 110,
      renderHeader: filterHeaderFor('applicationNumber', '申込番号'),
      render: (r) => <InlineText value={r.applicationNumber} onSave={(v) => save(r, { applicationNumber: v })} />,
    },
    numberColumn('revenueForecast', '売上予測', 100),
    numberColumn('feeForecast', '手数料予測', 100),
    {
      key: 'deficiencyNote',
      label: '不備内容',
      width: 140,
      renderHeader: filterHeaderFor('deficiencyNote', '不備内容'),
      render: (r) => <InlineText value={r.deficiencyNote} onSave={(v) => save(r, { deficiencyNote: v })} />,
    },
    {
      key: 'nextActionAt',
      label: '次回対応日',
      width: 92,
      renderHeader: filterHeaderFor('nextActionAt', '次回対応日'),
      render: (r) => <InlineFlexDate iso={r.nextActionAt} label="次回対応日" onSave={(iso) => save(r, { nextActionAt: iso })} onInvalid={setError} />,
    },
    {
      key: 'memo',
      label: '備考',
      width: 220,
      renderHeader: filterHeaderFor('memo', '備考'),
      render: (r) => <InlineText value={r.memo} onSave={(v) => save(r, { memo: v })} />,
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
        />
      </div>
    </AppLayout>
  );
}
