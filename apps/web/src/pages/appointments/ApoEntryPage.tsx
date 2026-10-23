import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { useTossFormFields, useMe } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { logCopy } from '../../lib/copyLog';
import { FieldInput } from '../toss-cases/TossEntryPage';

type AnswerValue = string | string[];

interface ApoFormItem {
  id: string;
  caseNumber: string;
  memo: string | null;
  hook: string | null;
  apStaffName: string | null;
  meetingStartAt: string | null;
  createdAt: string;
  version: number;
  customer: { corporateName: string | null } | null;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

/**
 * アポ登録(要望: アポ詳細をトスを通さず単品で作る)。項目は管理タブ「アポフォーム設定」で変更できる。
 * 登録したアポ詳細は下の一覧から本文の編集・コピーができる。
 */
export function ApoEntryPage() {
  const { data: fields, isLoading } = useTossFormFields(false, 'APPOINTMENT');
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<ApoFormItem | null>(null);

  const { data: mine } = useQuery({ queryKey: ['apo-form-mine'], queryFn: () => api.get<ApoFormItem[]>('/apo-form/mine') });

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  };

  // AP は既定でログインユーザー
  useEffect(() => {
    if (!fields || !me) return;
    const ap = fields.find((f) => f.targetKey === 'apStaffName');
    if (ap && ap.options.includes(me.name)) setAnswers((a) => (a.apStaffName === undefined ? { ...a, apStaffName: me.name } : a));
  }, [fields, me]);

  const submitMutation = useMutation({
    mutationFn: () => {
      // 日時は端末の時刻として送る(サーバーの時差で商談日時がずれないように)
      const body: Record<string, AnswerValue> = { ...answers };
      for (const f of fields ?? []) {
        const v = body[f.targetKey];
        if (f.fieldType === 'DATETIME' && typeof v === 'string' && v) body[f.targetKey] = new Date(v).toISOString();
      }
      return api.post<ApoFormItem>('/apo-form/submit', { answers: body });
    },
    onSuccess: (created) => {
      setError(null);
      setAnswers(me ? { apStaffName: answers.apStaffName ?? me.name } : {});
      queryClient.invalidateQueries({ queryKey: ['apo-form-mine'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      flash('アポ詳細を作成しました');
      setEditing(created);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '登録に失敗しました'),
  });

  const copy = async (item: ApoFormItem) => {
    try {
      await navigator.clipboard.writeText(item.memo ?? '');
      logCopy('アポ詳細(アポ登録)', item.memo ?? '', { target: item.customer?.corporateName ?? item.caseNumber });
      flash('アポ詳細をコピーしました');
    } catch {
      setError('コピーできませんでした');
    }
  };

  const set = (key: string, v: AnswerValue) => setAnswers((a) => ({ ...a, [key]: v }));
  const toggleMulti = (key: string, opt: string) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
      return { ...a, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-header">
          <h1 className="page-title">アポ登録</h1>
          <button onClick={() => navigate('/appointments')} style={{ fontSize: 12 }}>
            アポ実績一覧へ →
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>
          トスを通さずにアポ詳細を作ります。アポ実績・CLカレンダーに入り、サマリーのアポ件数にも数えます。
        </p>

        {error && (
          <div style={{ background: 'var(--color-danger-soft)', color: 'var(--color-danger)', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            {error}
          </div>
        )}
        {toast && (
          <div style={{ background: 'var(--color-success-soft)', color: 'var(--color-success)', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 12 }}>
            {toast}
          </div>
        )}

        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', padding: '16px 18px' }}>
            {(fields ?? []).map((f) => (
              <FieldInput key={f.id} field={f} value={answers[f.targetKey]} onText={(v) => set(f.targetKey, v)} onToggle={(opt) => toggleMulti(f.targetKey, opt)} />
            ))}
            <button
              className="btn-primary"
              disabled={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
              style={{ marginTop: 12, width: '100%', padding: '9px 0', fontSize: 13 }}
            >
              {submitMutation.isPending ? '作成中...' : 'アポ詳細を作成する'}
            </button>
          </div>
        )}

        <h2 style={{ fontSize: 14, margin: '20px 0 6px' }}>登録したアポ詳細</h2>
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
          {(mine ?? []).length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)', padding: '10px 12px', margin: 0 }}>まだありません</p>}
          {(mine ?? []).map((item) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: '1px solid var(--color-border)', fontSize: 12 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <b>{item.customer?.corporateName || '(店舗名未設定)'}</b>
                <span style={{ color: 'var(--color-text-muted)', marginLeft: 8 }}>
                  商談 {fmt(item.meetingStartAt)}
                  {item.hook ? ` / ${item.hook}` : ''}
                  {item.apStaffName ? ` / AP ${item.apStaffName}` : ''}
                </span>
              </span>
              <button type="button" onClick={() => setEditing(item)} style={{ fontSize: 11, padding: '2px 8px' }}>
                編集
              </button>
              <button type="button" onClick={() => copy(item)} disabled={!item.memo} style={{ fontSize: 11, padding: '2px 8px' }}>
                コピー
              </button>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <MemoEditor
          item={editing}
          onClose={() => setEditing(null)}
          onCopy={copy}
          onSaved={(memo) => {
            queryClient.invalidateQueries({ queryKey: ['apo-form-mine'] });
            queryClient.invalidateQueries({ queryKey: ['appointments'] });
            setEditing((cur) => (cur ? { ...cur, memo } : cur));
            flash('アポ詳細を保存しました');
          }}
        />
      )}
    </AppLayout>
  );
}

/** アポ詳細の本文を編集・コピーする(作成直後にも開く) */
function MemoEditor({
  item,
  onClose,
  onCopy,
  onSaved,
}: {
  item: ApoFormItem;
  onClose: () => void;
  onCopy: (item: ApoFormItem) => void;
  onSaved: (memo: string) => void;
}) {
  const [text, setText] = useState(item.memo ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.patch<{ memo: string }>(`/apo-form/mine/${item.id}`, { memo: text }),
    onSuccess: (r) => {
      setError(null);
      onSaved(r.memo ?? text);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '保存に失敗しました'),
  });
  const dirty = text !== (item.memo ?? '');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 96vw)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, flex: 1 }}>アポ詳細 {item.customer?.corporateName ? `- ${item.customer.corporateName}` : ''}</h3>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ width: '100%', minHeight: '50vh', fontSize: 13, lineHeight: 1.55, padding: '8px 10px' }} />
        {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onCopy({ ...item, memo: text })} disabled={!text} style={{ fontSize: 12 }}>
            コピー
          </button>
          <button type="button" className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()} style={{ fontSize: 12 }}>
            {save.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
