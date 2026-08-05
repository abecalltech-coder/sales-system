import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useCustomFields } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const ENTITY_TYPES = [
  { value: 'CUSTOMER', label: '顧客' },
  { value: 'TOSS', label: 'トス' },
  { value: 'APPOINTMENT', label: 'アポ' },
  { value: 'VISIT', label: '訪問' },
  { value: 'CONTRACT', label: '成約' },
  { value: 'ENTRY', label: 'エントリー' },
];

const DATA_TYPES = [
  'TEXT', 'TEXTAREA', 'INT', 'DECIMAL', 'CURRENCY', 'PHONE', 'EMAIL', 'URL',
  'DATE', 'DATETIME', 'TIME', 'SELECT', 'MULTISELECT', 'CHECKBOX',
  'USER', 'DEPT', 'TEAM', 'PRODUCT',
];

export function CustomFieldsAdminPage() {
  const [entityType, setEntityType] = useState('TOSS');
  const { data: fields, isLoading } = useCustomFields(entityType);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ fieldKey: '', label: '', dataType: 'TEXT', required: false });

  const createMutation = useMutation({
    mutationFn: () => api.post('/custom-fields', { entityType, ...form }),
    onSuccess: () => {
      setForm({ fieldKey: '', label: '', dataType: 'TEXT', required: false });
      queryClient.invalidateQueries({ queryKey: ['custom-fields', entityType] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-fields/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-fields', entityType] }),
  });

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>カスタム項目管理</h1>
        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {ENTITY_TYPES.map((e) => (
            <button key={e.value} onClick={() => setEntityType(e.value)} style={{ fontWeight: entityType === e.value ? 700 : 400 }}>
              {e.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <p>読み込み中...</p>
        ) : (
          <table style={{ width: '100%', fontSize: 13, marginBottom: 16, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: 6 }}>キー</th>
                <th style={{ padding: 6 }}>表示名</th>
                <th style={{ padding: 6 }}>データ型</th>
                <th style={{ padding: 6 }}>必須</th>
                <th style={{ padding: 6 }} />
              </tr>
            </thead>
            <tbody>
              {fields?.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6, color: '#9ca3af' }}>{f.fieldKey}</td>
                  <td style={{ padding: 6 }}>{f.label}</td>
                  <td style={{ padding: 6 }}>{f.dataType}</td>
                  <td style={{ padding: 6 }}>{f.required ? '必須' : '任意'}</td>
                  <td style={{ padding: 6 }}>
                    <button onClick={() => deleteMutation.mutate(f.id)}>削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>項目キー(作成後は変更不可)</label>
            <input
              value={form.fieldKey}
              onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
              style={{ display: 'block', width: '100%', padding: 6 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>表示名</label>
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              style={{ display: 'block', width: '100%', padding: 6 }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 13 }}>データ型</label>
            <select
              value={form.dataType}
              onChange={(e) => setForm({ ...form, dataType: e.target.value })}
              style={{ display: 'block', width: '100%', padding: 6 }}
            >
              {DATA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <label style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />{' '}
            必須項目にする
          </label>
          <button onClick={() => createMutation.mutate()} disabled={!form.fieldKey || !form.label}>
            項目を追加
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
