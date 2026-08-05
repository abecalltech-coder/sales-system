import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useVisits, useStatuses, VisitListItem } from '../../hooks/useApi';

const VISIT_KIND_LABEL: Record<string, string> = {
  INITIAL: '初回訪問',
  REVISIT: '再訪問',
  FINAL_CHECK: '最終確認訪問',
};

export function VisitsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const pageSize = 20;
  const navigate = useNavigate();

  const { data, isLoading } = useVisits({ page, pageSize, statusId: statusId || undefined });
  const { data: statuses } = useStatuses('VISIT');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const columns: Column<VisitListItem>[] = [
    { key: 'caseNumber', label: '案件番号', render: (r) => r.caseNumber, width: 160 },
    { key: 'scheduledAt', label: '訪問予定日時', render: (r) => new Date(r.scheduledAt).toLocaleString('ja-JP'), width: 160 },
    { key: 'visitKind', label: '種別', render: (r) => VISIT_KIND_LABEL[r.visitKind] ?? r.visitKind, width: 100 },
    {
      key: 'status',
      label: 'ステータス',
      render: (r) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 12,
            color: '#fff',
            background: statusColor(r.statusId),
          }}
        >
          {statusLabel(r.statusId)}
        </span>
      ),
      width: 120,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>訪問管理</h1>

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
          onRowClick={(r) => navigate(`/visits/${r.id}`)}
        />
      </div>
    </AppLayout>
  );
}
