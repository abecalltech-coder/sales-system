import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DealFieldItem, useDealFieldsAll } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const DATA_TYPE_LABELS: Record<DealFieldItem['dataType'], string> = {
  TEXT: 'テキスト',
  DATE: '日付',
  SELECT: 'プルダウン',
  USER: '担当者(登録アカウント)',
};

/**
 * 「案件管理」の列(項目)を追加・削除・名称変更し、プルダウン列の選択肢を
 * 追加・名前変更・削除・色変更できる画面右側のパネル(Googleスプレッドシートのプルダウン編集に相当)。
 */
export function DealFieldsPanel({
  onClose,
  focusFieldId,
}: {
  onClose: () => void;
  /** プルダウンセルの「＋選択肢を編集」から開いた場合、その列までスクロールして強調する */
  focusFieldId?: string | null;
}) {
  const { data: fields, isLoading } = useDealFieldsAll();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<DealFieldItem['dataType']>('TEXT');
  const [newOptions, setNewOptions] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['deal-fields'] });
  };

  const createField = useMutation({
    mutationFn: () =>
      api.post('/deals/fields', {
        label: newLabel.trim(),
        dataType: newType,
        options:
          newType === 'SELECT'
            ? newOptions
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
      }),
    onSuccess: () => {
      setNewLabel('');
      setNewOptions('');
      setNewType('TEXT');
      setError(null);
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '列の追加に失敗しました'),
  });

  const updateField = useMutation({
    mutationFn: (v: { id: string; patch: { label?: string; order?: number } }) => api.patch(`/deals/fields/${v.id}`, v.patch),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '更新に失敗しました'),
  });

  const deleteField = useMutation({
    mutationFn: (id: string) => api.delete(`/deals/fields/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : '削除に失敗しました'),
  });

  const list = [...(fields ?? [])].sort((a, b) => a.order - b.order);

  const swapOrder = (i: number, dir: -1 | 1) => {
    const a = list[i];
    const b = list[i + dir];
    if (!a || !b) return;
    updateField.mutate({ id: a.id, patch: { order: b.order } });
    updateField.mutate({ id: b.id, patch: { order: a.order } });
  };

  return (
    <div className="modal-backdrop" style={{ justifyContent: 'flex-end', padding: 0 }} onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          width: '100%',
          maxWidth: 440,
          height: '100%',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700 }}>列(項目)を管理</h2>
          <button onClick={onClose} style={{ fontSize: 13 }}>
            閉じる
          </button>
        </div>

        <div style={{ padding: '10px 18px', flex: 1, overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            表の列の追加・削除・名前変更、プルダウン列の選択肢の追加・削除・色変更ができます。並び順は▲▼で入れ替え。
          </p>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 10 }}>{error}</p>}

          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {list.map((f, i) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  highlighted={f.id === focusFieldId}
                  canMoveUp={i > 0}
                  canMoveDown={i < list.length - 1}
                  onMoveUp={() => swapOrder(i, -1)}
                  onMoveDown={() => swapOrder(i, 1)}
                  onRename={(label) => updateField.mutate({ id: f.id, patch: { label } })}
                  onDelete={() => {
                    if (window.confirm(`「${f.label}」列を削除します。この列のデータも失われます。よろしいですか？`)) {
                      deleteField.mutate(f.id);
                    }
                  }}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 18px 18px', borderTop: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>＋ 新しい列を追加</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              placeholder="列名"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{ padding: 6, fontSize: 13 }}
            />
            <select value={newType} onChange={(e) => setNewType(e.target.value as DealFieldItem['dataType'])} style={{ padding: 6, fontSize: 13 }}>
              {Object.entries(DATA_TYPE_LABELS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            {newType === 'SELECT' && (
              <textarea
                placeholder={'選択肢(1行に1つ。あとから追加も可能)'}
                value={newOptions}
                onChange={(e) => setNewOptions(e.target.value)}
                rows={3}
                style={{ padding: 6, fontSize: 13, fontFamily: 'inherit' }}
              />
            )}
            <button
              className="btn-primary"
              disabled={!newLabel.trim() || createField.isPending}
              onClick={() => createField.mutate()}
              style={{ fontSize: 13 }}
            >
              列を追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  highlighted,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
  onError,
}: {
  field: DealFieldItem;
  highlighted: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (label: string) => void;
  onDelete: () => void;
  onError: (msg: string) => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: '8px 10px',
        border: highlighted ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button className="btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={!canMoveUp} onClick={onMoveUp}>
            ▲
          </button>
          <button className="btn-sm" style={{ padding: '0 6px', lineHeight: 1.2 }} disabled={!canMoveDown} onClick={onMoveDown}>
            ▼
          </button>
        </div>
        <input
          defaultValue={field.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== field.label) onRename(v);
          }}
          style={{ flex: 1, padding: 4, fontSize: 13, fontWeight: 600, minWidth: 0 }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>{DATA_TYPE_LABELS[field.dataType]}</span>
        <button className="btn-danger btn-sm" onClick={onDelete} style={{ flexShrink: 0 }}>
          削除
        </button>
      </div>

      {field.dataType === 'SELECT' && <FieldOptions field={field} onError={onError} />}
    </div>
  );
}

function FieldOptions({ field, onError }: { field: DealFieldItem; onError: (msg: string) => void }) {
  const queryClient = useQueryClient();
  const [newOption, setNewOption] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['deal-fields'] });

  const createOption = useMutation({
    mutationFn: (labels: string[]) => Promise.all(labels.map((label) => api.post(`/deals/fields/${field.id}/options`, { label }))),
    onSuccess: () => {
      setNewOption('');
      invalidate();
    },
    onError: (e) => onError(e instanceof ApiError ? e.message : '選択肢の追加に失敗しました'),
  });
  const updateOption = useMutation({
    mutationFn: (v: { id: string; patch: { label?: string; color?: string } }) => api.patch(`/deals/field-options/${v.id}`, v.patch),
    onSuccess: invalidate,
    onError: (e) => onError(e instanceof ApiError ? e.message : '更新に失敗しました'),
  });
  const deleteOption = useMutation({
    mutationFn: (id: string) => api.delete(`/deals/field-options/${id}`),
    onSuccess: invalidate,
    onError: (e) => onError(e instanceof ApiError ? e.message : '削除に失敗しました'),
  });

  const options = [...field.options].sort((a, b) => a.order - b.order);

  return (
    <div style={{ marginTop: 8, paddingLeft: 30 }}>
      {options.map((o) => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
          <input
            defaultValue={o.label}
            onBlur={(e) => e.target.value.trim() && e.target.value !== o.label && updateOption.mutate({ id: o.id, patch: { label: e.target.value.trim() } })}
            style={{ flex: 1, padding: 4, fontSize: 12, minWidth: 0 }}
          />
          <input
            type="color"
            defaultValue={o.color ?? '#9ca3af'}
            onChange={(e) => updateOption.mutate({ id: o.id, patch: { color: e.target.value } })}
            title="色"
            style={{ width: 22, height: 22, padding: 0, flexShrink: 0 }}
          />
          <button
            onClick={() => {
              if (window.confirm(`「${o.label}」を削除しますか？`)) deleteOption.mutate(o.id);
            }}
            title="削除"
            style={{ flexShrink: 0, padding: '2px 6px', fontSize: 11, color: 'var(--color-danger)' }}
          >
            削除
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
        <input
          placeholder="選択肢を追加(複数行の貼り付けで一括追加)"
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newOption.trim()) createOption.mutate([newOption.trim()]);
          }}
          onPaste={(e) => {
            const raw = e.clipboardData.getData('text');
            const items = raw
              .split(/[\r\n\t]+/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (items.length > 1) {
              e.preventDefault();
              createOption.mutate(items);
            }
          }}
          style={{ flex: 1, padding: 4, fontSize: 12, minWidth: 0 }}
        />
        <button
          disabled={!newOption.trim() || createOption.isPending}
          onClick={() => createOption.mutate([newOption.trim()])}
          style={{ fontSize: 12, padding: '3px 8px', flexShrink: 0 }}
        >
          追加
        </button>
      </div>
    </div>
  );
}
