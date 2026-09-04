import { useMemo, useState } from 'react';
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
  const initialized = useMemo(() => {
    if (!fields || !me) return false;
    const staff = fields.find((f) => f.targetKey === 'tossUserName');
    if (staff && answers.tossUserName === undefined && staff.options.includes(me.name)) {
      setAnswers((a) => ({ ...a, tossUserName: me.name }));
    }
    return true;
  }, [fields, me]); // eslint-disable-line react-hooks/exhaustive-deps
  void initialized;

  const submitMutation = useMutation({
    mutationFn: () => api.post('/toss-form/submit', { answers }),
    onSuccess: () => {
      setDone(true);
      setError(null);
      setAnswers({});
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
      <div className="page" style={{ maxWidth: 560 }}>
        <div className="page-header">
          <h1 className="page-title">トス登録</h1>
          <button onClick={() => navigate('/toss-cases')} style={{ fontSize: 12 }}>
            トス実績一覧へ
          </button>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
        {done && (
          <p style={{ color: 'var(--color-success)', fontSize: 13, marginBottom: 10 }}>
            登録しました。続けて入力できます。
          </p>
        )}

        {isLoading ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div className="card" style={{ padding: 16 }}>
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
              style={{ marginTop: 12 }}
            >
              {submitMutation.isPending ? '登録中...' : 'トスを登録する'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
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
  const label = (
    <label style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'block', marginBottom: 3 }}>
      {f.label}
      {f.required && <span style={{ color: 'var(--color-danger)' }}> *</span>}
    </label>
  );
  const wrap = (child: React.ReactNode) => (
    <div style={{ marginBottom: 12 }}>
      {label}
      {child}
      {f.helpText && <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: '2px 0 0' }}>{f.helpText}</p>}
    </div>
  );

  if (f.fieldType === 'TEXTAREA') {
    return wrap(
      <textarea
        value={(value as string) ?? ''}
        onChange={(e) => onText(e.target.value)}
        style={{ width: '100%', minHeight: 80 }}
      />,
    );
  }
  if (f.fieldType === 'DATE' || f.fieldType === 'DATETIME') {
    return wrap(
      <input
        type={f.fieldType === 'DATE' ? 'date' : 'datetime-local'}
        value={(value as string) ?? ''}
        onChange={(e) => onText(e.target.value)}
        style={{ width: '100%' }}
      />,
    );
  }
  if (f.fieldType === 'SELECT') {
    return wrap(
      <select value={(value as string) ?? ''} onChange={(e) => onText(e.target.value)} style={{ width: '100%' }}>
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
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {f.options.map((o) => (
          <label key={o} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" checked={value === o} onChange={() => onText(o)} />
            {o}
          </label>
        ))}
      </div>,
    );
  }
  if (f.fieldType === 'MULTISELECT') {
    const arr = Array.isArray(value) ? value : [];
    return wrap(
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {f.options.map((o) => (
          <label key={o} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={arr.includes(o)} onChange={() => onToggle(o)} />
            {o}
          </label>
        ))}
      </div>,
    );
  }
  // TEXT
  return wrap(
    <input value={(value as string) ?? ''} onChange={(e) => onText(e.target.value)} style={{ width: '100%' }} />,
  );
}
