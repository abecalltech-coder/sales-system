import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useCustomers, CustomerListItem } from '../../hooks/useApi';

export function CustomersListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const pageSize = 20;
  const navigate = useNavigate();

  const { data, isLoading } = useCustomers({ page, pageSize, keyword: keyword || undefined });

  const columns: Column<CustomerListItem>[] = [
    { key: 'corporateName', label: '法人名', render: (r) => r.corporateName ?? '-', width: 200 },
    { key: 'contactName', label: '担当者', render: (r) => r.contactName ?? '-', width: 140 },
    { key: 'phone', label: '電話番号', render: (r) => r.phone ?? '-', width: 140 },
    { key: 'email', label: 'メールアドレス', render: (r) => r.email ?? '-' },
    { key: 'address', label: '住所', render: (r) => r.address ?? '-' },
  ];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>顧客管理</h1>

        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="法人名・担当者・電話番号・メールで検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13, width: 320 }}
          />
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
          onRowClick={(r) => navigate(`/customers/${r.id}`)}
        />
      </div>
    </AppLayout>
  );
}
