import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useTossFormFields, TossFormField } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const FIELD_TYPES: { id: TossFormField['fieldType']; label: string }[] = [
  { id: 'TEXT', label: '短文テキスト' },
  { id: 'TEXTAREA', label: '長文テキスト' },
  { id: 'SELECT', label: 'プルダウン(1つ選択)' },
  { id: 'MULTISELECT', label: 'チェックボックス(複数選択)' },
  { id: 'RADIO', label: 'ラジオ(1つ選択)' },
  { id: 'DATE', label: '日付' },
  { id: 'DATETIME', label: '日時' },
];

const TARGET_KEYS: { id: string; label: string }[] = [
  { id: 'corporateName', label: '店舗名' },
  { id: 'phone', label: '店舗連絡先' },
  { id: 'address', label: '住所' },
  { id: 'contactName', label: '担当者名' },
  { id: 'electricCompany', label: '電気会社(既契約)' },
  { id: 'listName', label: 'リスト' },
  { id: 'department', label: '部署' },
  { id: 'hook', label: 'フック' },
  { id: 'industry', label: '業種' },
  { id: 'proposal', label: '提案' },
  { id: 'callDirection', label: '架電or入電' },
  { id: 'tossUserName', label: 'トス担当者名' },
  { id: 'preConfirmStaffName', label: '前確担当者名' },
  { id: 'preferredCallAt', label: '架電希望日時' },
  { id: 'memo', label: '備考' },
];

const OPTIONS_MODES: { id: TossFormField['optionsMode']; label: string }[] = [
  { id: 'NONE', label: '選択肢なし' },
  { id: 'STATIC', label: 'この画面で管理する固定リスト' },
  { id: 'MASTER', label: 'マスタ管理と連動' },
  { id: 'USERS', label: 'ユーザー一覧と連動' },
];

export function TossFormAdminPage() {
  const { data: fields, isLoading } = useTossFormFields(true);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['toss-form-fields'] });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<TossFormField> }) => api.patch(`/toss-form/fields/${vars.id}`, vars.patch),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '更新に失敗しました'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/toss-form/fields/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '削除に失敗しました'),
  });
  const createMutation = useMutation({
    mutationFn: () => api.post('/toss-form/fields', { targetKey: 'memo', label: '新しい項目', fieldType: 'TEXT' }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '追加に失敗しました'),
  });

  const patch = (id: string, p: Partial<TossFormField>) => updateMutation.mutate({ id, patch: p });

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 820 }}>
        <h1 className="page-title" style={{ marginBottom: 8 }}>トスフォーム設定</h1>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.7 }}>
          アポインターが「トス登録」画面で入力する項目です。上から表示順に並びます。
          「マスタ管理と連動」「ユーザー一覧と連動」の選択肢は、それぞれ マスタ管理 / ユーザー管理 で編集します。
        </p>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

        {isLoading ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(fields ?? []).map((f) => (
              <div
                key={f.id}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 12,
                  background: f.active ? 'var(--color-surface)' : '#fafafa',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    defaultValue={f.order}
                    onBlur={(e) => Number(e.target.value) !== f.order && patch(f.id, { order: Number(e.target.value) })}
                    title="表示順"
                    style={{ width: 56 }}
                  />
                  <input
                    defaultValue={f.label}
                    onBlur={(e) => e.target.value !== f.label && patch(f.id, { label: e.target.value })}
                    placeholder="項目名"
                    style={{ flex: 1, minWidth: 140, fontWeight: 600 }}
                  />
                  <select
                    value={f.targetKey}
                    onChange={(e) => patch(f.id, { targetKey: e.target.value })}
                    title="保存先"
                    style={{ fontSize: 12 }}
                  >
                    {TARGET_KEYS.map((t) => (
                      <option key={t.id} value={t.id}>
                        → {t.label}
                      </option>
                    ))}
                  </select>
                  <select value={f.fieldType} onChange={(e) => patch(f.id, { fieldType: e.target.value as TossFormField['fieldType'] })} style={{ fontSize: 12 }}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input type="checkbox" defaultChecked={f.required} onChange={(e) => patch(f.id, { required: e.target.checked })} />
                    必須
                  </label>
                  <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input type="checkbox" defaultChecked={f.active} onChange={(e) => patch(f.id, { active: e.target.checked })} />
                    表示
                  </label>
                  <button
                    onClick={() => window.confirm(`「${f.label}」を削除しますか？`) && deleteMutation.mutate(f.id)}
                    style={{ fontSize: 11, color: 'var(--color-danger)', padding: '2px 6px' }}
                  >
                    削除
                  </button>
                </div>

                {['SELECT', 'MULTISELECT', 'RADIO'].includes(f.fieldType) && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <select
                      value={f.optionsMode}
                      onChange={(e) => patch(f.id, { optionsMode: e.target.value as TossFormField['optionsMode'] })}
                      style={{ fontSize: 12 }}
                    >
                      {OPTIONS_MODES.filter((m) => m.id !== 'NONE').map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    {f.optionsMode === 'MASTER' && (
                      <input
                        defaultValue={f.masterCategory ?? ''}
                        onBlur={(e) => e.target.value !== (f.masterCategory ?? '') && patch(f.id, { masterCategory: e.target.value })}
                        placeholder="マスタのカテゴリ(例: INDUSTRY)"
                        style={{ fontSize: 12, width: 200 }}
                      />
                    )}
                    {f.optionsMode === 'STATIC' && (
                      <textarea
                        defaultValue={f.staticOptions.join('\n')}
                        onBlur={(e) => {
                          const next = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                          if (JSON.stringify(next) !== JSON.stringify(f.staticOptions)) patch(f.id, { staticOptions: next });
                        }}
                        placeholder="選択肢を改行区切りで入力"
                        style={{ fontSize: 12, minWidth: 260, minHeight: 60, flex: 1 }}
                      />
                    )}
                    {f.optionsMode === 'USERS' && (
                      <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>ユーザー管理の在籍ユーザーが選択肢になります</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            <button onClick={() => createMutation.mutate()} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
              ＋ 項目を追加
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
