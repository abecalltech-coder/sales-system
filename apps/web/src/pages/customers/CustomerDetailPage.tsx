import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useCustomer } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: customer, isLoading } = useCustomer(id);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/customers/${id}`, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  if (isLoading || !customer) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  const field = (key: string, label: string, value: string | null) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 13, color: '#6b7280' }}>{label}</label>
      <input
        defaultValue={value ?? ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        style={{ display: 'block', width: '100%', padding: 6 }}
      />
    </div>
  );

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 480 }}>
        <Link to="/customers" style={{ fontSize: 13 }}>
          ← 顧客管理一覧へ戻る
        </Link>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>{customer.corporateName ?? '法人名未登録'}</h1>

        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        {field('corporateName', '法人名', customer.corporateName)}
        {field('contactName', '顧客担当者', customer.contactName)}
        {field('phone', '電話番号', customer.phone)}
        {field('email', 'メールアドレス', customer.email)}
        {field('address', '住所', customer.address)}
        {field('building', '建物名', customer.building)}

        <button onClick={() => updateMutation.mutate({ version: customer.version, ...form })} disabled={Object.keys(form).length === 0}>
          保存
        </button>
      </div>
    </AppLayout>
  );
}
