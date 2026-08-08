import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText, InlineSelect } from '../../components/InlineEdit';
import { CommentsPanel } from '../../components/CommentsPanel';
import { PresenceBar } from '../../components/PresenceBar';
import { useEntries, useStatuses, useMe, EntryListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { usePresence } from '../../lib/usePresence';

export function EntriesListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useEntries({ page, pageSize, statusId: statusId || undefined });
  const { data: me } = useMe();
  const presence = usePresence('ENTRY', me?.id);
  const { data: statuses } = useStatuses('ENTRY');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/entries/${vars.id}`, { version: vars.version, ...vars.patch }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });
  const save = (row: EntryListItem, patch: Record<string, unknown>) =>
    updateMutation.mutate({ id: row.id, version: row.version, patch });

  const columns: Column<EntryListItem>[] = [
    {
      key: 'storeName',
      label: '店舗名',
      render: (r) => <InlineText value={r.storeName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    { key: 'entryAt', label: 'エントリー日', render: (r) => (r.entryAt ? new Date(r.entryAt).toLocaleDateString('ja-JP') : '-'), width: 120 },
    {
      key: 'status',
      label: 'エントリーステータス',
      render: (r) => (
        <InlineSelect
          value={r.statusId}
          options={statuses?.map((s) => ({ id: s.id, label: s.displayName })) ?? []}
          onSave={(v) => save(r, { statusId: v })}
          style={{
            background: statusColor(r.statusId),
            color: '#fff',
            borderRadius: 999,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
          }}
        />
      ),
      width: 150,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20 }}>エントリー管理</h1>
          <a href="/api/entries/export" style={{ fontSize: 13 }}>
            CSV出力
          </a>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <PresenceBar viewers={presence.viewers} />

        <div style={{ marginBottom: 16 }}>
          <select
            value={statusId}
            onChange={(e) => {
              setStatusId(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13 }}
          >
            <option value="">すべてのステータス</option>
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
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: 'var(--color-text-faint)', display: 'block', marginBottom: 4 }}>不備内容</label>
                <InlineText
                  value={r.deficiencyNote}
                  onSave={(v) => save(r, { deficiencyNote: v })}
                  placeholder="不備内容を入力"
                  style={{ border: '1px solid var(--color-border)', padding: 6, background: 'var(--color-surface)', borderRadius: 4 }}
                />
              </div>
              <CommentsPanel entityType="ENTRY" entityId={r.id} />
            </div>
          )}
        />
      </div>
    </AppLayout>
  );
}
