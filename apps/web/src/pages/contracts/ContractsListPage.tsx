import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText, InlineSelect } from '../../components/InlineEdit';
import { CommentsPanel } from '../../components/CommentsPanel';
import { PresenceBar } from '../../components/PresenceBar';
import { useContracts, useStatuses, useMe, ContractListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { usePresence } from '../../lib/usePresence';

export function ContractsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const [keyword, setKeyword] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useContracts({ page, pageSize, statusId: statusId || undefined, keyword: keyword || undefined });
  const { data: me } = useMe();
  const presence = usePresence('CONTRACT', me?.id);
  const { data: statuses } = useStatuses('MATCHING');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

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

  const columns: Column<ContractListItem>[] = [
    {
      key: 'storeName',
      label: '店舗名',
      render: (r) => <InlineText value={r.storeName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    { key: 'contractedAt', label: '成約日', render: (r) => (r.contractedAt ? new Date(r.contractedAt).toLocaleDateString('ja-JP') : '-'), width: 120 },
    { key: 'contractAmount', label: '契約金額', render: (r) => (r.contractAmount ? `¥${Number(r.contractAmount).toLocaleString()}` : '-'), width: 120 },
    {
      key: 'status',
      label: 'マッチング状況',
      render: (r) => (
        <InlineSelect
          value={r.matchingStatusId}
          options={statuses?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { matchingStatusId: v })}
          style={{
            background: statusColor(r.matchingStatusId),
            color: '#fff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
          }}
        />
      ),
      width: 140,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20 }}>成約管理</h1>
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
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
          onRowClick={(r) => setExpandedId((cur) => (cur === r.id ? null : r.id))}
          onCellFocus={presence.notifyFocus}
          onCellBlur={presence.notifyBlur}
          cellCursor={presence.cellCursor}
          expandedRowId={expandedId}
          renderExpanded={(r) => (
            <div>
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                マッチング日: {r.matchingAt ? new Date(r.matchingAt).toLocaleDateString('ja-JP') : '未入力'} / スイッチング日:{' '}
                {r.switchingAt ? new Date(r.switchingAt).toLocaleDateString('ja-JP') : '未入力'}
              </p>
              <CommentsPanel entityType="CONTRACT" entityId={r.id} />
            </div>
          )}
        />
      </div>
    </AppLayout>
  );
}
