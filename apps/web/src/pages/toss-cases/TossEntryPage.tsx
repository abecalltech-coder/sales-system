import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { useTossFormFields, useMe, TossFormField } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

type AnswerValue = string | string[];

/** アポインター用のトス登録フォーム。項目は管理タブ「トスフォーム設定」で変更できる。 */
export function TossEntryPage() {
  const { data: fields, isLoading } = useTossFormFields(false);
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // トス担当者は既定でログインユーザー
  useEffect(() => {
    if (!fields || !me) return;
    const staff = fields.find((f) => f.targetKey === 'tossUserName');
    if (staff && staff.options.includes(me.name)) {
      setAnswers((a) => (a.tossUserName === undefined ? { ...a, tossUserName: me.name } : a));
    }
  }, [fields, me]);

  const submitMutation = useMutation({
    mutationFn: () => api.post('/toss-form/submit', { answers }),
    onSuccess: () => {
      setDone(true);
      setError(null);
      setAnswers({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '登録に失敗しました'),
  });

  const set = (key: string, v: AnswerValue) => {
    setAnswers((a) => ({ ...a, [key]: v }));
    setDone(false);
  };
  const toggleMulti = (key: string, opt: string) => {
    setAnswers((a) => {
      const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
      return { ...a, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });
    setDone(false);
  };

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="page-header">
          <h1 className="page-title">トス登録</h1>
          <button onClick={() => navigate('/toss-cases')} style={{ fontSize: 12 }}>
            トス実績一覧へ →
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--color-danger-soft)',
              color: 'var(--color-danger)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}
        {done && (
          <div
            style={{
              background: 'var(--color-success-soft)',
              color: 'var(--color-success)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            トスを登録しました。続けて入力できます。
          </div>
        )}

        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-sm)',
              padding: '18px 20px',
            }}
          >
            {(fields ?? []).map((f) => (
              <FieldInput
                key={f.id}
                field={f}
                value={answers[f.targetKey]}
                onText={(v) => set(f.targetKey, v)}
                onToggle={(opt) => toggleMulti(f.targetKey, opt)}
              />
            ))}
            <button
              className="btn-primary"
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              style={{ marginTop: 16, width: '100%', padding: '9px 0', fontSize: 13 }}
            >
              {submitMutation.isPending ? '登録中...' : 'トスを登録する'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--color-text)',
  display: 'block',
  marginBottom: 5,
};
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px' };

/** チェック/ラジオの選択肢をタップしやすいピルとして描画 */
function OptionPill({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 13,
        padding: '6px 12px',
        borderRadius: 999,
        border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--color-border-strong)'}`,
        background: checked ? 'var(--color-primary)' : 'var(--color-surface)',
        color: checked ? '#fff' : 'var(--color-text)',
        cursor: 'pointer',
        fontWeight: checked ? 700 : 500,
      }}
    >
      {label}
    </button>
  );
}

function FieldInput({
  field: f,
  value,
  onText,
  onToggle,
}: {
  field: TossFormField;
  value: AnswerValue | undefined;
  onText: (v: string) => void;
  onToggle: (opt: string) => void;
}) {
  const wrap = (child: React.ReactNode) => (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>
        {f.label}
        {f.required && <span style={{ color: 'var(--color-danger)', marginLeft: 4 }}>必須</span>}
      </label>
      {child}
      {f.helpText && <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: '4px 0 0' }}>{f.helpText}</p>}
    </div>
  );

  if (f.fieldType === 'TEXTAREA') {
    return wrap(
      <textarea
        value={(value as string) ?? ''}
        onChange={(e) => onText(e.target.value)}
        style={{ ...inputStyle, minHeight: 90, lineHeight: 1.5 }}
      />,
    );
  }
  if (f.fieldType === 'DATE' || f.fieldType === 'DATETIME') {
    return wrap(
      <input
        type={f.fieldType === 'DATE' ? 'date' : 'datetime-local'}
        value={(value as string) ?? ''}
        onChange={(e) => onText(e.target.value)}
        style={inputStyle}
      />,
    );
  }
  if (f.fieldType === 'SELECT') {
    return wrap(
      <select value={(value as string) ?? ''} onChange={(e) => onText(e.target.value)} style={inputStyle}>
        <option value="">選択してください</option>
        {f.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>,
    );
  }
  if (f.fieldType === 'RADIO') {
    return wrap(
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {f.options.map((o) => (
          <OptionPill key={o} label={o} checked={value === o} onClick={() => onText(value === o ? '' : o)} />
        ))}
      </div>,
    );
  }
  if (f.fieldType === 'MULTISELECT') {
    const arr = Array.isArray(value) ? value : [];
    return wrap(
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {f.options.map((o) => (
          <OptionPill key={o} label={o} checked={arr.includes(o)} onClick={() => onToggle(o)} />
        ))}
      </div>,
    );
  }
  return wrap(<input value={(value as string) ?? ''} onChange={(e) => onText(e.target.value)} style={inputStyle} />);
}
