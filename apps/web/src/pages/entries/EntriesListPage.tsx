import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useEntries, useStatuses, EntryListItem } from '../../hooks/useApi';

export function EntriesListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const pageSize = 20;
  const navigate = useNavigate();

  const { data, isLoading } = useEntries({ page, pageSize, statusId: statusId || undefined });
  const { data: statuses } = useStatuses('ENTRY');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const columns: Column<EntryListItem>[] = [
    { key: 'caseNumber', label: '案件番号', render: (r) => r.caseNumber, width: 160 },
    { key: 'entryAt', label: 'エントリー日', render: (r) => (r.entryAt ? new Date(r.entryAt).toLocaleDateString('ja-JP') : '-'), width: 120 },
    {
      key: 'status',
      label: 'エントリーステータス',
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
      width: 140,
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
          onRowClick={(r) => navigate(`/entries/${r.id}`)}
        />
      </div>
    </AppLayout>
  );
}
