import { useState } from 'react';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useAuditLogs, AuditLogItem } from '../../hooks/useApi';

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const { data, isLoading } = useAuditLogs({ page, pageSize });

  const columns: Column<AuditLogItem>[] = [
    { key: 'createdAt', label: '日時', render: (r) => new Date(r.createdAt).toLocaleString('ja-JP'), width: 160 },
    { key: 'actor', label: '操作者', render: (r) => r.actor?.name ?? 'システム', width: 140 },
    { key: 'action', label: '操作種別', render: (r) => r.action, width: 160 },
    { key: 'success', label: '結果', render: (r) => (r.success ? '成功' : `失敗: ${r.errorMessage ?? ''}`), width: 200 },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>操作ログ</h1>
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
        />
      </div>
    </AppLayout>
  );
}
