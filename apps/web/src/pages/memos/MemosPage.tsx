import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useIsPhone } from '../../lib/useIsPhone';
import { api, ApiError } from '../../lib/api';

interface Memo {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * メモ(要望: いろいろな内容を題名ごとに作成できる)。自分専用。
 * PCは左に題名の一覧・右に本文、携帯は一覧 → 本文の画面遷移。入力は自動で保存する。
 */
export function MemosPage() {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const { data: memos, isLoading } = useQuery({ queryKey: ['memos'], queryFn: () => api.get<Memo[]>('/memos') });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<Memo>('/memos', { title: '無題のメモ', body: '' }),
    onSuccess: (m) => {
      queryClient.setQueryData<Memo[]>(['memos'], (cur) => [m, ...(cur ?? [])]);
      setSelectedId(m.id);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'メモを作成できませんでした'),
  });

  const list = (memos ?? []).filter((m) => !q || m.title.includes(q) || m.body.includes(q));
  const selected = memos?.find((m) => m.id === selectedId) ?? null;

  // PCは最初のメモを開いておく
  useEffect(() => {
    if (!isPhone && !selectedId && memos && memos.length > 0) setSelectedId(memos[0].id);
  }, [isPhone, selectedId, memos]);

  const showList = !isPhone || !selected;
  const showEditor = !isPhone || !!selected;

  return (
    <AppLayout>
      <div style={{ display: 'flex', height: isPhone ? 'calc(var(--viewport-height, 100vh) - 36px - 64px)' : 'calc(var(--viewport-height, 100vh) - 36px)', minHeight: 0 }}>
        {showList && (
          <section
            aria-label="メモ一覧"
            style={{
              width: isPhone ? '100%' : 280,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-surface)',
              borderRight: isPhone ? 'none' : '1px solid var(--color-border)',
              minHeight: 0,
            }}
          >
            <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>メモ</h1>
                <button type="button" className="btn-primary" disabled={create.isPending} onClick={() => create.mutate()} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 16 }}>
                  ＋ 新しいメモ
                </button>
              </div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="題名・本文で検索" style={{ height: 30, fontSize: 13 }} />
              {error && <p style={{ margin: 0, fontSize: 12, color: 'var(--color-danger)' }}>{error}</p>}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {isLoading && <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
              {!isLoading && list.length === 0 && (
                <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>{memos?.length ? '該当するメモはありません' : 'まだメモがありません。「＋ 新しいメモ」から作れます。'}</p>
              )}
              {list.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    padding: '7px 12px',
                    border: 'none',
                    borderBottom: '1px solid var(--color-sunken)',
                    borderRadius: 0,
                    boxShadow: 'none',
                    background: m.id === selectedId && !isPhone ? 'var(--color-primary-soft)' : 'transparent',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'var(--color-text)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                    {m.pinned && (
                      <span title="ピン留め" style={{ fontSize: 10, color: 'var(--color-primary)' }}>
                        ●
                      </span>
                    )}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                    {fmt(m.updatedAt)} {m.body.replace(/\s+/g, ' ').slice(0, 60)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {showEditor &&
          (selected ? (
            <MemoEditor key={selected.id} memo={selected} showBack={isPhone} onBack={() => setSelectedId(null)} onDeleted={() => setSelectedId(null)} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-faint)', fontSize: 13 }}>メモを選ぶか、新しく作ってください</div>
          ))}
      </div>
    </AppLayout>
  );
}

/** 本文の編集。入力が止まったら自動で保存する */
function MemoEditor({ memo, showBack, onBack, onDeleted }: { memo: Memo; showBack: boolean; onBack: () => void; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(memo.title);
  const [body, setBody] = useState(memo.body);
  const [status, setStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ title, body });
  latest.current = { title, body };

  const save = async (patch: Partial<Memo>) => {
    setStatus('saving');
    try {
      const m = await api.patch<Memo>(`/memos/${memo.id}`, patch);
      queryClient.setQueryData<Memo[]>(['memos'], (cur) => (cur ?? []).map((x) => (x.id === m.id ? m : x)));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  const schedule = () => {
    setStatus('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(latest.current), 700);
  };

  // 画面を離れるときに未保存があれば保存
  useEffect(
    () => () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
        void api.patch(`/memos/${memo.id}`, latest.current).then(() => queryClient.invalidateQueries({ queryKey: ['memos'] }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const remove = useMutation({
    mutationFn: () => api.delete(`/memos/${memo.id}`),
    onSuccess: () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      queryClient.setQueryData<Memo[]>(['memos'], (cur) => (cur ?? []).filter((x) => x.id !== memo.id));
      onDeleted();
    },
  });

  const statusText = { saved: '保存済み', saving: '保存中...', dirty: '入力中', error: '保存に失敗しました(通信を確認してください)' }[status];

  return (
    <section aria-label="メモの内容" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        {showBack && (
          <button
            type="button"
            onClick={() => {
              if (timer.current) {
                window.clearTimeout(timer.current);
                timer.current = undefined;
                void save(latest.current);
              }
              onBack();
            }}
            aria-label="一覧へ戻る"
            style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
        <span style={{ fontSize: 11, color: status === 'error' ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>{statusText}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => void save({ pinned: !memo.pinned })} style={{ fontSize: 11, padding: '3px 10px' }}>
          {memo.pinned ? 'ピン留めを外す' : 'ピン留め'}
        </button>
        <button type="button" onClick={() => window.confirm(`「${title}」を削除しますか？`) && remove.mutate()} style={{ fontSize: 11, padding: '3px 10px', color: 'var(--color-danger)' }}>
          削除
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 14px', gap: 8, minHeight: 0 }}>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            schedule();
          }}
          placeholder="題名"
          aria-label="題名"
          style={{ fontSize: 17, fontWeight: 900, border: 'none', boxShadow: 'none', padding: '4px 0', background: 'transparent' }}
        />
        <div style={{ fontSize: 10.5, color: 'var(--color-text-faint)' }}>
          作成 {fmt(memo.createdAt)} ・ 更新 {fmt(memo.updatedAt)}
        </div>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            schedule();
          }}
          placeholder="内容を入力(自動で保存されます)"
          aria-label="内容"
          style={{ flex: 1, minHeight: 200, fontSize: 14, lineHeight: 1.7, resize: 'none', border: '1px solid var(--color-border)', borderRadius: 8, padding: '10px 12px' }}
        />
      </div>
    </section>
  );
}
