import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText, InlineSelect } from '../../components/InlineEdit';
import { CommentsPanel } from '../../components/CommentsPanel';
import { PresenceBar } from '../../components/PresenceBar';
import { useVisits, useStatuses, useMe, VisitListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { usePresence } from '../../lib/usePresence';

const VISIT_KIND_LABEL: Record<string, string> = {
  INITIAL: '初回訪問',
  REVISIT: '再訪問',
  FINAL_CHECK: '最終確認訪問',
};

export function VisitsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pageSize = 20;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useVisits({ page, pageSize, statusId: statusId || undefined });
  const { data: me } = useMe();
  const presence = usePresence('VISIT', me?.id);
  const { data: statuses } = useStatuses('VISIT');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; patch: Record<string, unknown> }) =>
      api.patch(`/visits/${vars.id}`, { version: vars.version, ...vars.patch }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['visits'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });
  const save = (row: VisitListItem, patch: Record<string, unknown>) =>
    updateMutation.mutate({ id: row.id, version: row.version, patch });

  const columns: Column<VisitListItem>[] = [
    {
      key: 'storeName',
      label: '店舗名',
      render: (r) => <InlineText value={r.storeName} onSave={(v) => save(r, { corporateName: v })} style={{ fontWeight: 600 }} />,
    },
    { key: 'scheduledAt', label: '訪問予定日時', render: (r) => new Date(r.scheduledAt).toLocaleString('ja-JP'), width: 160 },
    { key: 'visitKind', label: '種別', render: (r) => VISIT_KIND_LABEL[r.visitKind] ?? r.visitKind, width: 100 },
    {
      key: 'status',
      label: 'ステータス',
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
      width: 120,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>訪問管理</h1>

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
              <p style={{ fontSize: 13, marginBottom: 4 }}>
                訪問到着・商談開始/終了はモバイル版から操作します。PC版はここでは状況確認のみ行えます。
              </p>
              <p style={{ fontSize: 13, marginBottom: 12 }}>
                到着日時: {r.arrivedAt ? new Date(r.arrivedAt).toLocaleString('ja-JP') : '未到着'} / 商談結果:{' '}
                {r.meetingSession?.meetingResult ?? '未入力'}
              </p>
              <CommentsPanel entityType="VISIT" entityId={r.id} />
            </div>
          )}
        />
      </div>
    </AppLayout>
  );
}
