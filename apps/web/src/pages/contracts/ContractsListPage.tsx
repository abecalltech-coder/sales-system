import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useContracts, useStatuses, ContractListItem } from '../../hooks/useApi';

export function ContractsListPage() {
  const [page, setPage] = useState(1);
  const [statusId, setStatusId] = useState('');
  const [keyword, setKeyword] = useState('');
  const pageSize = 20;
  const navigate = useNavigate();

  const { data, isLoading } = useContracts({ page, pageSize, statusId: statusId || undefined, keyword: keyword || undefined });
  const { data: statuses } = useStatuses('MATCHING');

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  const columns: Column<ContractListItem>[] = [
    { key: 'caseNumber', label: '案件番号', render: (r) => r.caseNumber, width: 160 },
    { key: 'contractedAt', label: '成約日', render: (r) => (r.contractedAt ? new Date(r.contractedAt).toLocaleDateString('ja-JP') : '-'), width: 120 },
    { key: 'contractAmount', label: '契約金額', render: (r) => (r.contractAmount ? `¥${Number(r.contractAmount).toLocaleString()}` : '-'), width: 120 },
    {
      key: 'status',
      label: 'マッチング状況',
      render: (r) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 999,
            fontSize: 12,
            color: '#fff',
            background: statusColor(r.matchingStatusId),
          }}
        >
          {statusLabel(r.matchingStatusId)}
        </span>
      ),
      width: 140,
    },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>成約管理</h1>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            placeholder="案件番号で検索"
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
          onRowClick={(r) => navigate(`/contracts/${r.id}`)}
        />
      </div>
    </AppLayout>
  );
}
