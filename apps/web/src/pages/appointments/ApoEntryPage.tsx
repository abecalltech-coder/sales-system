import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { useTossFormFields, useMe } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { logCopy } from '../../lib/copyLog';
import { useIsPhone } from '../../lib/useIsPhone';
import { FieldInput } from '../toss-cases/TossEntryPage';

type AnswerValue = string | string[];

/** 訪問(フックが HPZOOM 以外)のときだけ出して必須にする項目(要望)。サーバー側 VISIT_REQUIRED_KEYS と揃える */
const VISIT_ONLY_KEYS = ['nearestStation', 'walkMinutes'];
const isOnlineHook = (hook: AnswerValue | undefined) =>
  typeof hook === 'string' && hook.normalize('NFKC').replace(/\s/g, '').toUpperCase() === 'HPZOOM';

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
  const isPhone = useIsPhone();
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
      // オンライン(HPZOOM)では最寄り駅・徒歩分数を使わない
      if (isOnlineHook(body.hook)) for (const k of VISIT_ONLY_KEYS) delete body[k];
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

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/apo-form/mine/${id}`),
    onSuccess: (_r, id) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['apo-form-mine'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setEditing((cur) => (cur?.id === id ? null : cur));
      flash('アポ詳細を削除しました');
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '削除に失敗しました'),
  });
  const remove = (item: ApoFormItem) => {
    // アポ実績・CLカレンダーからも消えるため確認する
    if (!window.confirm(`「${item.customer?.corporateName || '(店舗名未設定)'}」のアポ詳細を削除しますか？\nアポ実績・CLカレンダーからも消えます。`)) return;
    removeMutation.mutate(item.id);
  };

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
      {/* スマホは左右に余白を取り、枠が画面からはみ出さないようにする(要望) */}
      <div className="page" style={{ maxWidth: 760, ...(isPhone ? { padding: '16px 16px 24px' } : {}) }}>
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
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-sm)',
              padding: isPhone ? '18px 16px' : '16px 18px',
              width: '100%',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            {(fields ?? [])
              .filter((f) => !(VISIT_ONLY_KEYS.includes(f.targetKey) && isOnlineHook(answers.hook)))
              .map((f) => (
              <FieldInput
                key={f.id}
                field={VISIT_ONLY_KEYS.includes(f.targetKey) ? { ...f, required: true } : f}
                value={answers[f.targetKey]}
                onText={(v) => set(f.targetKey, v)}
                onToggle={(opt) => toggleMulti(f.targetKey, opt)}
                otherText
              />
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
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={removeMutation.isPending}
                style={{ fontSize: 11, padding: '2px 8px', color: 'var(--color-danger)' }}
              >
                削除
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
      {/* 余白を広めに取る(要望: 編集画面の余白が少なく見づらい) */}
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(680px, 96vw)', display: 'flex', flexDirection: 'column', gap: 14, padding: '22px 24px', boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0, fontSize: 15, flex: 1 }}>アポ詳細 {item.customer?.corporateName ? `- ${item.customer.corporateName}` : ''}</h3>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: '52vh', fontSize: 13, lineHeight: 1.75, padding: '14px 16px', borderRadius: 8 }}
        />
        {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
          <button type="button" onClick={() => onCopy({ ...item, memo: text })} disabled={!text} style={{ fontSize: 12, padding: '6px 16px' }}>
            コピー
          </button>
          <button type="button" className="btn-primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()} style={{ fontSize: 12, padding: '6px 18px' }}>
            {save.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
