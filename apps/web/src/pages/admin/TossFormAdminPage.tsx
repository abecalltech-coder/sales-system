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

const CHOICE_TYPES = ['SELECT', 'MULTISELECT', 'RADIO'];

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
    mutationFn: (order: number) => api.post('/toss-form/fields', { targetKey: 'memo', label: '新しい項目', fieldType: 'TEXT', order }),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '追加に失敗しました'),
  });

  const patch = (id: string, p: Partial<TossFormField>) => updateMutation.mutate({ id, patch: p });
  const list = fields ?? [];

  // 上下移動: 隣の項目と order を入れ替える
  const move = (idx: number, dir: -1 | 1) => {
    const a = list[idx];
    const b = list[idx + dir];
    if (!a || !b) return;
    patch(a.id, { order: b.order });
    patch(b.id, { order: a.order });
  };

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-header">
          <h1 className="page-title">トスフォーム設定</h1>
          <button
            onClick={() => createMutation.mutate((list.length ? list[list.length - 1].order : 0) + 10)}
            className="btn-primary"
            style={{ fontSize: 12 }}
          >
            ＋ 項目を追加
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 14, lineHeight: 1.8 }}>
          アポインターが「トス登録」画面で入力する項目です。上から表示順に並びます。
          <br />
          選択肢が「マスタ管理と連動」「ユーザー一覧と連動」の項目は、それぞれ <b>マスタ管理</b> / <b>ユーザー管理</b> で選択肢を編集します。
        </p>
        {error && (
          <div style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}

        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {list.map((f, idx) => (
              <FieldCard
                key={f.id}
                field={f}
                first={idx === 0}
                last={idx === list.length - 1}
                targetLabel={TARGET_KEYS.find((t) => t.id === f.targetKey)?.label ?? f.targetKey}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
                onPatch={(p) => patch(f.id, p)}
                onDelete={() => window.confirm(`「${f.label}」を削除しますか？`) && deleteMutation.mutate(f.id)}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function FieldCard({
  field: f,
  first,
  last,
  onMoveUp,
  onMoveDown,
  onPatch,
  onDelete,
}: {
  field: TossFormField;
  first: boolean;
  last: boolean;
  targetLabel: string;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatch: (p: Partial<TossFormField>) => void;
  onDelete: () => void;
}) {
  const cell = { fontSize: 12, padding: '5px 8px' } as const;
  const metaLabel = { fontSize: 11, color: 'var(--color-text-faint)', display: 'block', marginBottom: 2 } as const;

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 8,
        background: f.active ? 'var(--color-surface)' : 'repeating-linear-gradient(45deg,#fafafa,#fafafa 8px,#f4f4f5 8px,#f4f4f5 16px)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {/* ヘッダー: 並び替え + 項目名 + 表示/削除 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button onClick={onMoveUp} disabled={first} title="上へ" style={{ padding: '0 5px', fontSize: 10, lineHeight: 1.4 }}>
            ▲
          </button>
          <button onClick={onMoveDown} disabled={last} title="下へ" style={{ padding: '0 5px', fontSize: 10, lineHeight: 1.4 }}>
            ▼
          </button>
        </div>
        <input
          defaultValue={f.label}
          onBlur={(e) => e.target.value.trim() && e.target.value !== f.label && onPatch({ label: e.target.value.trim() })}
          placeholder="項目名(アポインターに表示される名前)"
          style={{ flex: 1, fontSize: 14, fontWeight: 700, padding: '5px 8px' }}
        />
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          <input type="checkbox" defaultChecked={f.required} onChange={(e) => onPatch({ required: e.target.checked })} />
          必須
        </label>
        <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
          <input type="checkbox" defaultChecked={f.active} onChange={(e) => onPatch({ active: e.target.checked })} />
          表示
        </label>
        <button onClick={onDelete} style={{ fontSize: 11, color: 'var(--color-danger)', padding: '3px 7px' }}>
          削除
        </button>
      </div>

      {/* 保存先 + タイプ */}
      <div style={{ display: 'flex', gap: 12, padding: '10px', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180, flex: 1 }}>
          <span style={metaLabel}>保存先(トス実績のどの欄に入るか)</span>
          <select value={f.targetKey} onChange={(e) => onPatch({ targetKey: e.target.value })} style={{ ...cell, width: '100%' }}>
            {TARGET_KEYS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 180, flex: 1 }}>
          <span style={metaLabel}>入力タイプ</span>
          <select
            value={f.fieldType}
            onChange={(e) => onPatch({ fieldType: e.target.value as TossFormField['fieldType'] })}
            style={{ ...cell, width: '100%' }}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 選択肢(プルダウン/チェック/ラジオのときだけ) */}
      {CHOICE_TYPES.includes(f.fieldType) && (
        <div style={{ padding: '0 10px 12px', borderTop: '1px dashed var(--color-border)', paddingTop: 10 }}>
          <span style={metaLabel}>選択肢の管理方法</span>
          <select
            value={f.optionsMode === 'NONE' ? 'STATIC' : f.optionsMode}
            onChange={(e) => onPatch({ optionsMode: e.target.value as TossFormField['optionsMode'] })}
            style={{ ...cell, marginBottom: 8 }}
          >
            <option value="STATIC">この画面で管理(下に直接入力)</option>
            <option value="MASTER">マスタ管理と連動</option>
            <option value="USERS">ユーザー一覧と連動</option>
          </select>

          {f.optionsMode === 'STATIC' && (
            <div>
              <span style={metaLabel}>選択肢(1行に1つ)</span>
              <textarea
                defaultValue={f.staticOptions.join('\n')}
                onBlur={(e) => {
                  const next = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                  if (JSON.stringify(next) !== JSON.stringify(f.staticOptions)) onPatch({ staticOptions: next });
                }}
                placeholder={'例:\n飲食\n美容室\nジム'}
                style={{ width: '100%', minHeight: 90, fontSize: 12, lineHeight: 1.5, padding: '6px 8px' }}
              />
            </div>
          )}
          {f.optionsMode === 'MASTER' && (
            <div>
              <span style={metaLabel}>マスタのカテゴリ名</span>
              <input
                defaultValue={f.masterCategory ?? ''}
                onBlur={(e) => e.target.value !== (f.masterCategory ?? '') && onPatch({ masterCategory: e.target.value.trim() })}
                placeholder="例: INDUSTRY / TOSS_PRE_CONFIRM"
                style={{ ...cell, width: 260 }}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: '4px 0 0' }}>
                選択肢は「マスタ管理」で編集します。現在の候補:{' '}
                {f.options.length ? f.options.join('、') : '(なし)'}
              </p>
            </div>
          )}
          {f.optionsMode === 'USERS' && (
            <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: 0 }}>
              「ユーザー管理」の在籍ユーザーが選択肢になります(現在 {f.options.length} 名)。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
