import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useProducts, useSources } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

interface CategoryDef {
  value: string;
  label: string;
}

// タブ単位でまとめることで、関連する項目を一度に見渡せるようにしている(要望: タブ毎・項目ごとに見やすく)
const TAB_GROUPS: { title: string; categories: CategoryDef[] }[] = [
  {
    title: 'トス実績',
    categories: [
      { value: 'TOSS_PRE_CONFIRM', label: '前確担当者' },
      { value: 'TOSS_PROGRESS', label: '進捗' },
      { value: 'TOSS_NG_REASON', label: 'NG理由' },
    ],
  },
  {
    title: 'アポ実績: 担当者',
    categories: [
      { value: 'APPOINTMENT_PRE_CONTACT', label: '前連担当' },
      { value: 'APPOINTMENT_CLOSER', label: 'CL(クロージング担当)' },
    ],
  },
  {
    title: 'アポ実績: ステータス',
    categories: [
      { value: 'APPOINTMENT_HP_PROGRESS', label: 'HP進捗' },
      { value: 'APPOINTMENT_TYPE', label: '種別' },
      { value: 'APPOINTMENT_PROGRESS', label: '進捗' },
      { value: 'APPOINTMENT_ACQUISITION_METHOD', label: '獲得方法' },
    ],
  },
  {
    title: 'アポ実績: 商材別ステータス',
    categories: [
      { value: 'APPOINTMENT_ANSHIN_BIZ_STATUS', label: 'あんしんBiz' },
      { value: 'APPOINTMENT_ANSHIN_BIZ_LOST_REASON', label: 'あんしんBiz失注理由' },
      { value: 'APPOINTMENT_MOBILE_STATUS', label: 'モバイル' },
      { value: 'APPOINTMENT_MOBILE_LOST_REASON', label: 'モバイル失注理由' },
      { value: 'APPOINTMENT_FUNFO_STATUS', label: 'funfo' },
      { value: 'APPOINTMENT_FUNFO_LOST_REASON', label: 'funfo失注理由' },
    ],
  },
  {
    title: 'アポ実績: 交付関連',
    categories: [
      { value: 'APPOINTMENT_CONSENT_FORM_TYPE', label: '同意書種別' },
      { value: 'APPOINTMENT_DELIVERY_METHOD', label: '交付方法' },
      { value: 'APPOINTMENT_DELIVERY_STATUS', label: '交付状況' },
    ],
  },
  {
    title: '基本ステータス',
    categories: [
      { value: 'TOSS', label: 'トス' },
      { value: 'APPOINTMENT', label: 'アポ' },
      { value: 'VISIT', label: '訪問' },
      { value: 'MATCHING', label: 'マッチング' },
    ],
  },
];

// これらのカテゴリは内部コードの意味を持たず、単純な選択肢名の管理として使うため
// 追加フォームでは表示名のみ入力させ、内部コードは自動採番する。
const SIMPLE_LABEL_CATEGORIES = new Set(
  TAB_GROUPS.flatMap((g) => g.categories.map((c) => c.value)).filter(
    (v) => !['TOSS', 'APPOINTMENT', 'VISIT', 'MATCHING'].includes(v),
  ),
);

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
  const [tabIndex, setTabIndex] = useState(0);

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 1000 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>マスタ管理</h1>

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
          {TAB_GROUPS.map((group, i) => (
            <button
              key={group.title}
              onClick={() => setTabIndex(i)}
              style={{
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: tabIndex === i ? 700 : 500,
                border: 'none',
                borderBottom: tabIndex === i ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'transparent',
                color: tabIndex === i ? 'var(--color-primary)' : 'var(--color-text)',
                cursor: 'pointer',
              }}
            >
              {group.title}
            </button>
          ))}
          <button
            onClick={() => setTabIndex(TAB_GROUPS.length)}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: tabIndex === TAB_GROUPS.length ? 700 : 500,
              border: 'none',
              borderBottom: tabIndex === TAB_GROUPS.length ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'transparent',
              color: tabIndex === TAB_GROUPS.length ? 'var(--color-primary)' : 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            商材・流入元
          </button>
        </div>

        {tabIndex < TAB_GROUPS.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {TAB_GROUPS[tabIndex].categories.map((c) => (
              <CategoryCard key={c.value} category={c.value} label={c.label} simpleLabel={SIMPLE_LABEL_CATEGORIES.has(c.value)} />
            ))}
          </div>
        ) : (
          <ProductsAndSources />
        )}
      </div>
    </AppLayout>
  );
}

function CategoryCard({ category, label, simpleLabel }: { category: string; label: string; simpleLabel: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');

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

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/status-master', {
        category,
        internalCode: simpleLabel ? `${category}_${crypto.randomUUID().slice(0, 8)}` : newCode,
        displayName: newLabel,
      }),
    onSuccess: () => {
      setNewCode('');
      setNewLabel('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['status-master', category] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 14,
        background: 'var(--color-surface)',
      }}
    >
      <h2 style={{ fontSize: 14, marginBottom: 10 }}>{label}</h2>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
      ) : (
        <div style={{ marginBottom: 10 }}>
          {statuses?.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>まだ登録がありません</p>}
          {statuses?.map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
              <input
                defaultValue={s.displayName}
                onBlur={(e) => e.target.value !== s.displayName && updateMutation.mutate({ id: s.id, displayName: e.target.value })}
                style={{ flex: 1, padding: 4, fontSize: 12, minWidth: 0 }}
              />
              <input
                type="color"
                defaultValue={s.color ?? '#9ca3af'}
                onChange={(e) => updateMutation.mutate({ id: s.id, color: e.target.value })}
                title="色"
                style={{ width: 24, height: 24, padding: 0, flexShrink: 0 }}
              />
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }} title="有効">
                <input
                  type="checkbox"
                  defaultChecked={s.active}
                  onChange={(e) => updateMutation.mutate({ id: s.id, active: e.target.checked })}
                />
                有効
              </label>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {!simpleLabel && (
          <input
            placeholder="内部コード"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            style={{ width: 90, padding: 5, fontSize: 12 }}
          />
        )}
        <input
          placeholder={simpleLabel ? '名前を追加' : '表示名'}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newLabel && (simpleLabel || newCode)) createMutation.mutate();
          }}
          style={{ flex: 1, padding: 5, fontSize: 12, minWidth: 0 }}
        />
        <button
          onClick={() => createMutation.mutate()}
          disabled={(!simpleLabel && !newCode) || !newLabel}
          style={{ fontSize: 12, padding: '5px 10px', flexShrink: 0 }}
        >
          追加
        </button>
      </div>
    </div>
  );
}

function ProductsAndSources() {
  const { data: products } = useProducts();
  const { data: sources } = useSources();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>商材</h2>
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {products?.map((p) => <li key={p.id}>{p.name}</li>)}
        </ul>
      </div>
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 14, background: 'var(--color-surface)' }}>
        <h2 style={{ fontSize: 14, marginBottom: 10 }}>流入元</h2>
        <ul style={{ fontSize: 13, paddingLeft: 18 }}>
          {sources?.map((s) => <li key={s.id}>{s.name}</li>)}
        </ul>
      </div>
    </div>
  );
}
