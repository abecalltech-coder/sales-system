import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useTossCases, useStatuses, TossCaseListItem } from '../../hooks/useApi';

export function TossCasesListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusId, setStatusId] = useState('');
  const pageSize = 20;
  const navigate = useNavigate();

  const { data, isLoading } = useTossCases({ page, pageSize, keyword: keyword || undefined, statusId: statusId || undefined });
  const { data: statuses } = useStatuses('TOSS');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const columns: Column<TossCaseListItem>[] = [
    { key: 'caseNumber', label: '案件番号', render: (r) => r.caseNumber, width: 160 },
    { key: 'receivedAt', label: '受付日時', render: (r) => new Date(r.receivedAt).toLocaleString('ja-JP'), width: 160 },
    { key: 'corporateName', label: '法人名', render: (r) => r.customer?.corporateName ?? '-' },
    { key: 'contactName', label: '顧客担当者', render: (r) => r.customer?.contactName ?? '-' },
    { key: 'phone', label: '電話番号', render: (r) => r.customer?.phone ?? '-' },
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20 }}>トス実績管理</h1>
          <a href="/api/toss-cases/export" style={{ fontSize: 13 }}>
            CSV出力
          </a>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="案件番号・法人名・メモで検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13, width: 280 }}
          />
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
          onRowClick={(r) => navigate(`/toss-cases/${r.id}`)}
        />
      </div>
    </AppLayout>
  );
}
