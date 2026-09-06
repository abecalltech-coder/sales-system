import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useFinalReportAdminFields, FinalReportField } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function FinalReportFieldsAdminPage() {
  const { data: fields, isLoading } = useFinalReportAdminFields();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['final-report-admin-fields'] });
    queryClient.invalidateQueries({ queryKey: ['final-report-fields'] });
    queryClient.invalidateQueries({ queryKey: ['final-report-month'] });
  };

  const update = useMutation({
    mutationFn: (v: { id: string; patch: Partial<FinalReportField> }) => api.patch(`/final-reports/admin/fields/${v.id}`, v.patch),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '更新に失敗しました'),
  });
  const create = useMutation({
    mutationFn: () => api.post('/final-reports/admin/fields', { label: '新しい項目', fieldType: 'NUMBER' }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '追加に失敗しました'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/final-reports/admin/fields/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '削除に失敗しました'),
  });

  const patch = (id: string, p: Partial<FinalReportField>) => update.mutate({ id, patch: p });
  const list = [...(fields ?? [])].sort((a, b) => a.order - b.order);

  const swapOrder = (i: number, dir: -1 | 1) => {
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    patch(a.id, { order: b.order });
    patch(b.id, { order: a.order });
  };

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">最終報告 項目設定</h1>
          <button className="btn-primary" onClick={() => create.mutate()}>
            ＋ 項目を追加
          </button>
        </div>

        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
          「最終報告」画面の行(入力項目)を編集します。並び順は▲▼で入れ替え。初期項目は削除すると非表示(データは保持)、追加項目は完全に削除されます。
        </p>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 13, marginBottom: 10 }}>{error}</p>}

        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 720 }}>
            {list.map((f, i) => (
              <div
                key={f.id}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  background: f.active
                    ? 'var(--color-surface)'
                    : 'repeating-linear-gradient(45deg,var(--color-subtle),var(--color-subtle) 8px,var(--color-sunken) 8px,var(--color-sunken) 16px)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button className="btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={i === 0} onClick={() => swapOrder(i, -1)}>
                    ▲
                  </button>
                  <button className="btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={i === list.length - 1} onClick={() => swapOrder(i, 1)}>
                    ▼
                  </button>
                </div>

                <input
                  defaultValue={f.label}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== f.label && patch(f.id, { label: e.target.value.trim() })}
                  style={{ flex: 1, fontSize: 13, fontWeight: 600 }}
                />

                <select
                  value={f.computed ? 'COMPUTED' : f.fieldType}
                  disabled={!!f.computed}
                  onChange={(e) => patch(f.id, { fieldType: e.target.value as 'NUMBER' | 'TEXT' })}
                  style={{ fontSize: 12, width: 120 }}
                >
                  <option value="NUMBER">数値</option>
                  <option value="TEXT">テキスト</option>
                  {f.computed && <option value="COMPUTED">自動計算</option>}
                </select>

                <input
                  placeholder="単位"
                  defaultValue={f.unit ?? ''}
                  onBlur={(e) => (e.target.value || null) !== (f.unit ?? null) && patch(f.id, { unit: e.target.value || null })}
                  style={{ width: 70, fontSize: 12 }}
                />

                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <input type="checkbox" checked={f.active} onChange={(e) => patch(f.id, { active: e.target.checked })} />
                  表示
                </label>

                <button
                  className="btn-danger btn-sm"
                  onClick={() => {
                    if (window.confirm(`「${f.label}」を削除しますか？`)) remove.mutate(f.id);
                  }}
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
