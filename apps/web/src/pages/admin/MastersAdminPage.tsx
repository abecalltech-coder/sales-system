import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useProducts, useSources } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const CATEGORIES = [
  { value: 'TOSS', label: 'トス' },
  { value: 'APPOINTMENT', label: 'アポ' },
  { value: 'VISIT', label: '訪問' },
  { value: 'MATCHING', label: 'マッチング' },
  { value: 'ENTRY', label: 'エントリー' },
];

interface StatusRow {
  id: string;
  category: string;
  internalCode: string;
  displayName: string;
  color: string | null;
  order: number;
  active: boolean;
}

export function MastersAdminPage() {
  const [category, setCategory] = useState('TOSS');
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: statuses, isLoading } = useQuery({
    queryKey: ['status-master', category],
    queryFn: () => api.get<StatusRow[]>(`/status-master?category=${category}`),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; displayName?: string; color?: string; active?: boolean }) =>
      api.patch(`/status-master/${vars.id}`, vars),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['status-master', category] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const createMutation = useMutation({
    mutationFn: () => api.post('/status-master', { category, internalCode: newCode, displayName: newLabel }),
    onSuccess: () => {
      setNewCode('');
      setNewLabel('');
      queryClient.invalidateQueries({ queryKey: ['status-master', category] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  const { data: products } = useProducts();
  const { data: sources } = useSources();

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>マスタ管理</h1>
        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        <h2 style={{ fontSize: 15, marginBottom: 8 }}>ステータスマスタ</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              style={{ fontWeight: category === c.value ? 700 : 400 }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p>読み込み中...</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, marginBottom: 16, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>内部コード</th>
                <th style={{ padding: 6 }}>表示名</th>
                <th style={{ padding: 6 }}>色</th>
                <th style={{ padding: 6 }}>有効</th>
              </tr>
            </thead>
            <tbody>
              {statuses?.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6, color: '#9ca3af' }}>{s.internalCode}</td>
                  <td style={{ padding: 6 }}>
                    <input
                      defaultValue={s.displayName}
                      onBlur={(e) => e.target.value !== s.displayName && updateMutation.mutate({ id: s.id, displayName: e.target.value })}
                      style={{ padding: 4, width: 140 }}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <input
                      type="color"
                      defaultValue={s.color ?? '#9ca3af'}
                      onChange={(e) => updateMutation.mutate({ id: s.id, color: e.target.value })}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <input
                      type="checkbox"
                      defaultChecked={s.active}
                      onChange={(e) => updateMutation.mutate({ id: s.id, active: e.target.checked })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
          <input placeholder="内部コード(例: TOSS_CUSTOM)" value={newCode} onChange={(e) => setNewCode(e.target.value)} style={{ padding: 6, fontSize: 13 }} />
          <input placeholder="表示名" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={{ padding: 6, fontSize: 13 }} />
          <button onClick={() => createMutation.mutate()} disabled={!newCode || !newLabel}>
            ステータス追加
          </button>
        </div>

        <h2 style={{ fontSize: 15, marginBottom: 8 }}>商材</h2>
        <ul style={{ fontSize: 13, marginBottom: 24 }}>
          {products?.map((p) => <li key={p.id}>{p.name}</li>)}
        </ul>

        <h2 style={{ fontSize: 15, marginBottom: 8 }}>流入元</h2>
        <ul style={{ fontSize: 13 }}>
          {sources?.map((s) => <li key={s.id}>{s.name}</li>)}
        </ul>
      </div>
    </AppLayout>
  );
}
