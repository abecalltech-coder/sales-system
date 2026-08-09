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
  { value: 'TOSS_PRE_CONFIRM', label: 'トス実績: 前確担当者' },
  { value: 'TOSS_PROGRESS', label: 'トス実績: 進捗' },
  { value: 'TOSS_NG_REASON', label: 'トス実績: NG理由' },
  { value: 'APPOINTMENT_PRE_CONTACT', label: 'アポ実績: 前連担当' },
  { value: 'APPOINTMENT_CLOSER', label: 'アポ実績: CL(クロージング担当)' },
  { value: 'APPOINTMENT_HP_PROGRESS', label: 'アポ実績: HP進捗' },
  { value: 'APPOINTMENT_TYPE', label: 'アポ実績: 種別' },
  { value: 'APPOINTMENT_PROGRESS', label: 'アポ実績: 進捗' },
  { value: 'APPOINTMENT_ACQUISITION_METHOD', label: 'アポ実績: 獲得方法' },
  { value: 'APPOINTMENT_ANSHIN_BIZ_STATUS', label: 'アポ実績: あんしんBiz' },
  { value: 'APPOINTMENT_ANSHIN_BIZ_LOST_REASON', label: 'アポ実績: あんしんBiz失注理由' },
  { value: 'APPOINTMENT_MOBILE_STATUS', label: 'アポ実績: モバイル' },
  { value: 'APPOINTMENT_MOBILE_LOST_REASON', label: 'アポ実績: モバイル失注理由' },
  { value: 'APPOINTMENT_FUNFO_STATUS', label: 'アポ実績: funfo' },
  { value: 'APPOINTMENT_FUNFO_LOST_REASON', label: 'アポ実績: funfo失注理由' },
  { value: 'APPOINTMENT_CONSENT_FORM_TYPE', label: 'アポ実績: 同意書種別' },
  { value: 'APPOINTMENT_DELIVERY_METHOD', label: 'アポ実績: 交付方法' },
  { value: 'APPOINTMENT_DELIVERY_STATUS', label: 'アポ実績: 交付状況' },
];

// これらのカテゴリは内部コードの意味を持たず、単純な選択肢名の管理として使うため
// 追加フォームでは表示名のみ入力させ、内部コードは自動採番する。
const SIMPLE_LABEL_CATEGORIES = new Set([
  'TOSS_PRE_CONFIRM',
  'TOSS_PROGRESS',
  'TOSS_NG_REASON',
  'APPOINTMENT_PRE_CONTACT',
  'APPOINTMENT_CLOSER',
  'APPOINTMENT_HP_PROGRESS',
  'APPOINTMENT_TYPE',
  'APPOINTMENT_PROGRESS',
  'APPOINTMENT_ACQUISITION_METHOD',
  'APPOINTMENT_ANSHIN_BIZ_STATUS',
  'APPOINTMENT_ANSHIN_BIZ_LOST_REASON',
  'APPOINTMENT_MOBILE_STATUS',
  'APPOINTMENT_MOBILE_LOST_REASON',
  'APPOINTMENT_FUNFO_STATUS',
  'APPOINTMENT_FUNFO_LOST_REASON',
  'APPOINTMENT_CONSENT_FORM_TYPE',
  'APPOINTMENT_DELIVERY_METHOD',
  'APPOINTMENT_DELIVERY_STATUS',
]);

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
  const isSimpleLabelCategory = SIMPLE_LABEL_CATEGORIES.has(category);
  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/status-master', {
        category,
        internalCode: isSimpleLabelCategory ? `${category}_${crypto.randomUUID().slice(0, 8)}` : newCode,
        displayName: newLabel,
      }),
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
                {!isSimpleLabelCategory && <th style={{ padding: 6 }}>内部コード</th>}
                <th style={{ padding: 6 }}>表示名</th>
                <th style={{ padding: 6 }}>色</th>
                <th style={{ padding: 6 }}>有効</th>
              </tr>
            </thead>
            <tbody>
              {statuses?.map((s) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {!isSimpleLabelCategory && <td style={{ padding: 6, color: '#9ca3af' }}>{s.internalCode}</td>}
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
          {!isSimpleLabelCategory && (
            <input placeholder="内部コード(例: TOSS_CUSTOM)" value={newCode} onChange={(e) => setNewCode(e.target.value)} style={{ padding: 6, fontSize: 13 }} />
          )}
          <input
            placeholder={isSimpleLabelCategory ? '名称を入力' : '表示名'}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            style={{ padding: 6, fontSize: 13 }}
          />
          <button onClick={() => createMutation.mutate()} disabled={(!isSimpleLabelCategory && !newCode) || !newLabel}>
            追加
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
