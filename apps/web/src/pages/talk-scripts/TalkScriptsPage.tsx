import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { api, ApiError } from '../../lib/api';
import { RichEditor, RichRun, RichView } from './richText';
import { useIsPhone } from '../../lib/useIsPhone';

/** APランク(要望)。ユーザー管理の APランク と同じ値 */
export const TALK_RANKS = [
  { id: 'BRONZE', label: 'ブロンズ', color: 'var(--color-rank-bronze)' },
  { id: 'SILVER', label: 'シルバー', color: 'var(--color-rank-silver)' },
  { id: 'GOLD', label: 'ゴールド', color: 'var(--color-rank-gold)' },
];

interface TalkStep {
  id: string;
  rank: string;
  name: string;
  body: string;
  /** 文字色・塗りつぶし付き(null は色なし) */
  nameRich: RichRun[] | null;
  bodyRich: RichRun[] | null;
  /** このトークで出やすいアウト */
  outIds: string[];
}

interface TalkOut {
  id: string;
  /** どのベーストークの項目のアウト返しか(項目ごとに別々に編集する)。null は項目に紐づかない以前のアウト */
  stepId: string | null;
  /** アウト返しのあとに戻るトーク。null はアウトが出たトーク */
  returnStepId: string | null;
  /** よく出るアウト(トークの下に表示する) */
  pinned: boolean;
  /** このアウトを使うランク(項目に紐づくものはその項目のランク) */
  ranks: string[];
  label: string;
  category: string;
  body: string;
  /** 文字色・塗りつぶし付き(null は色なし) */
  labelRich: RichRun[] | null;
  bodyRich: RichRun[] | null;
}

interface TalkData {
  canEdit: boolean;
  myRank: string | null;
  steps: TalkStep[];
  outs: TalkOut[];
}

/** トークの下に出す「よく出るアウト」の上限(要望: 多すぎて見づらいので絞る) */
const PIN_MAX = 5;

const smallBtn: React.CSSProperties = { fontSize: 11, padding: '1px 7px' };
const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' };
const scriptText: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
const emptyText: React.CSSProperties = { fontSize: 12, color: 'var(--color-text-faint)' };

/** 入力欄から離れたときに保存する(他の人の更新は、入力中でなければ反映する) */
function BlurText({
  value,
  onSave,
  multiline,
  label,
  placeholder,
  list,
}: {
  value: string;
  onSave: (v: string) => void;
  multiline?: boolean;
  label: string;
  placeholder?: string;
  list?: string;
}) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setV(value);
  }, [value]);
  const common = {
    value: v,
    'aria-label': label,
    placeholder,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      if (v !== value) onSave(v);
    },
    style: { width: '100%', boxSizing: 'border-box' as const, fontSize: 13, padding: '3px 6px' },
  };
  return multiline ? (
    <textarea {...common} rows={Math.max(3, v.split('\n').length + 1)} onChange={(e) => setV(e.target.value)} style={{ ...common.style, lineHeight: 1.55, resize: 'vertical' }} />
  ) : (
    <input {...common} list={list} onChange={(e) => setV(e.target.value)} />
  );
}

/** アウトのボタン。選択中は濃い色、出やすいアウト以外は薄い色 */
function OutChip({ label, on, muted, disabled, onClick }: { label: string; on?: boolean; muted?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      style={{
        fontSize: 12,
        padding: '1px 7px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${on ? 'var(--color-appo)' : muted ? 'var(--color-border-strong)' : 'var(--color-appo-border)'}`,
        background: on ? 'var(--color-appo)' : muted ? 'var(--color-subtle)' : 'var(--color-appo-soft)',
        color: on ? 'var(--color-surface)' : muted ? 'var(--color-text-muted)' : 'var(--color-appo)',
        fontWeight: on ? 700 : 400,
        boxShadow: 'none',
      }}
    >
      {label || '(名前未入力)'}
    </button>
  );
}

/**
 * トークスクリプト(要望: APのランクごとのベーストークとアウト返し集)。
 * リストと並べて縦長の窓で見る想定。ベーストークの中でアウトを押すと、その場にアウト返しが開く。
 * アウト返しだけを見たいときは「アウト返し集」タブ。
 */
export function TalkScriptsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['talk-scripts'], queryFn: () => api.get<TalkData>('/talk-scripts') });
  const [pickedRank, setPickedRank] = useState<string | null>(null);
  const [tab, setTab] = useState<'talk' | 'outs'>('talk');
  // アウト返しから戻るトーク(そのトークまで動かして光らせる)
  const [flash, setFlash] = useState<{ stepId: string; at: number } | null>(null);
  const goToStep = (stepId: string) => {
    setTab('talk');
    setFlash({ stepId, at: Date.now() });
  };
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 最初は自分のランクを開く(要望)。全ランク見られる
  const rank = pickedRank ?? data?.myRank ?? 'BRONZE';
  const canEdit = !!data?.canEdit;
  const edit = canEdit && editMode;
  const steps = useMemo(() => (data?.steps ?? []).filter((s) => s.rank === rank), [data, rank]);
  // 項目に紐づくアウトはその項目のランク、紐づかない以前のアウトは使うランクで出す
  const outs = useMemo(() => {
    const ids = new Set(steps.map((s) => s.id));
    return (data?.outs ?? []).filter((o) => (o.stepId ? ids.has(o.stepId) : o.ranks.includes(rank)));
  }, [data, steps, rank]);

  const onError = (e: unknown) => {
    setError(e instanceof ApiError ? e.message : '保存できませんでした');
    queryClient.invalidateQueries({ queryKey: ['talk-scripts'] });
  };
  const onSuccess = () => {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['talk-scripts'] });
  };
  const saveStep = useMutation({ mutationFn: (v: { id: string; patch: Partial<TalkStep> }) => api.patch(`/talk-scripts/steps/${v.id}`, v.patch), onSuccess, onError });
  const saveOut = useMutation({ mutationFn: (v: { id: string; patch: Partial<TalkOut> }) => api.patch(`/talk-scripts/outs/${v.id}`, v.patch), onSuccess, onError });
  const addStep = useMutation({ mutationFn: () => api.post('/talk-scripts/steps', { rank, name: `トーク${steps.length + 1}` }), onSuccess, onError });
  const removeStep = useMutation({ mutationFn: (id: string) => api.delete(`/talk-scripts/steps/${id}`), onSuccess, onError });
  const removeOut = useMutation({ mutationFn: (id: string) => api.delete(`/talk-scripts/outs/${id}`), onSuccess, onError });
  const reorder = useMutation({ mutationFn: (v: { kind: 'steps' | 'outs'; ids: string[] }) => api.post(`/talk-scripts/${v.kind}/reorder`, { ids: v.ids }), onSuccess, onError });

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 760 }}>
        <div className="page-header" style={{ gap: 8 }}>
          <h1 className="page-title" style={{ flex: 1 }}>
            トークスクリプト
          </h1>
          {canEdit && (
            <button type="button" className={editMode ? 'btn-primary' : undefined} onClick={() => setEditMode((v) => !v)} style={{ fontSize: 12 }}>
              {editMode ? '編集を終える' : '編集'}
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {TALK_RANKS.map((r) => {
            const on = r.id === rank;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPickedRank(r.id)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontSize: 12,
                  padding: '4px 0',
                  fontWeight: on ? 700 : 400,
                  color: on ? 'var(--color-primary)' : undefined,
                  background: on ? 'var(--color-primary-soft)' : undefined,
                  borderColor: on ? 'var(--color-primary)' : undefined,
                }}
              >
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: r.color }} />
                {r.label}
                {data?.myRank === r.id && <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 400 }}>(自分)</span>}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 14, borderBottom: '1px solid var(--color-border-strong)', marginBottom: 8 }}>
          {(
            [
              ['talk', 'ベーストーク'],
              ['outs', 'アウト返し集'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={{
                background: 'none',
                border: 'none',
                borderRadius: 0,
                boxShadow: 'none',
                borderBottom: `2px solid ${tab === key ? 'var(--color-primary)' : 'transparent'}`,
                padding: '4px 2px',
                fontSize: 13,
                fontWeight: tab === key ? 700 : 400,
                color: tab === key ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '0 0 8px' }}>{error}</p>}
        {isLoading && <p style={emptyText}>読み込み中...</p>}

        {!isLoading && tab === 'talk' && (
          <TalkTab
            rank={rank}
            steps={steps}
            allSteps={data?.steps ?? []}
            outs={outs}
            edit={edit}
            flash={flash}
            onGoTo={goToStep}
            onPinOut={(id, pinned) => saveOut.mutate({ id, patch: { pinned } })}
            onSave={(id, patch) => saveStep.mutate({ id, patch })}
            onAdd={() => addStep.mutate()}
            onRemove={(s) => window.confirm(`「${s.name || 'このトーク'}」を削除しますか？`) && removeStep.mutate(s.id)}
            onMove={(ids) => reorder.mutate({ kind: 'steps', ids })}
          />
        )}
        {!isLoading && tab === 'outs' && (
          <OutsTab
            rank={rank}
            steps={steps}
            allSteps={data?.steps ?? []}
            outs={outs}
            allOuts={data?.outs ?? []}
            edit={edit}
            onGoTo={goToStep}
            onSave={(id, patch) => saveOut.mutate({ id, patch })}
            onRemove={(o) => {
              const step = data?.steps.find((s) => s.id === o.stepId);
              const where = step ? `(${step.name || 'このトーク'}のアウト返し。他のトークのアウト返しは消えません)` : '';
              if (window.confirm(`「${o.label || 'このアウト'}」を削除しますか？${where}`)) removeOut.mutate(o.id);
            }}
            onMove={(ids) => reorder.mutate({ kind: 'outs', ids })}
            onError={onError}
          />
        )}
      </div>
    </AppLayout>
  );
}

/** ベーストーク。各トークの下のアウトを押すと、その場にアウト返しが開く */
function TalkTab({
  rank,
  steps,
  allSteps,
  outs,
  edit,
  flash,
  onGoTo,
  onPinOut,
  onSave,
  onAdd,
  onRemove,
  onMove,
}: {
  rank: string;
  steps: TalkStep[];
  allSteps: TalkStep[];
  outs: TalkOut[];
  edit: boolean;
  flash: { stepId: string; at: number } | null;
  onGoTo: (stepId: string) => void;
  onPinOut: (id: string, pinned: boolean) => void;
  onSave: (id: string, patch: Partial<TalkStep>) => void;
  onAdd: () => void;
  onRemove: (s: TalkStep) => void;
  onMove: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState<{ stepId: string; outId: string } | null>(null);

  // 戻るトークへ動かして光らせる(押すたびに光り直す)
  useEffect(() => {
    if (!flash) return;
    const el = document.getElementById(`talk-step-${flash.stepId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('talk-flash');
    void el.offsetWidth;
    el.classList.add('talk-flash');
  }, [flash]);
  const stepTitle = (id: string) => {
    const i = steps.findIndex((x) => x.id === id);
    return i < 0 ? 'トーク' : `${i + 1}. ${steps[i].name || '(名前未入力)'}`;
  };
  // 「アウトを探す」を開いているトーク
  const [findStepId, setFindStepId] = useState<string | null>(null);
  // 複製の画面(開いたときに選んでおく項目)
  const [copying, setCopying] = useState<string[] | null>(null);

  const move = (i: number, dir: -1 | 1) => {
    const ids = steps.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onMove(ids);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {edit && allSteps.length > 0 && (
        <button type="button" className={copying ? 'btn-primary' : undefined} onClick={() => setCopying(copying ? null : [])} style={{ alignSelf: 'flex-end', fontSize: 12 }}>
          ランクのトークを複製して作成
        </button>
      )}
      {copying && <CopyStepsForm key={copying.join(',')} rank={rank} allSteps={allSteps} initial={copying} onDone={() => setCopying(null)} />}
      {steps.length === 0 && <p style={emptyText}>このランクのトークはまだありません。{edit ? '' : '編集できる人が作成すると表示されます。'}</p>}
      {steps.map((s, i) => {
        // この項目のアウト返し(以前の共有アウトは項目に選ばれていたもの)
        const isHot = (o: TalkOut) => o.stepId === s.id || (!o.stepId && s.outIds.includes(o.id));
        const hot = outs.filter(isHot);
        const pinned = hot.filter((o) => o.pinned).slice(0, PIN_MAX);
        const pinnedCount = hot.filter((o) => o.pinned).length;
        const ret = open?.stepId === s.id ? outs.find((o) => o.id === open.outId) : undefined;
        return (
          <div key={s.id} id={`talk-step-${s.id}`} className="card" style={{ padding: '7px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {edit ? (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, flexShrink: 0, paddingBottom: 6 }}>{i + 1}.</span>
                  <RichEditor singleLine big rich={s.nameRich} plain={s.name} label="トークの名前" placeholder="トークの名前(例: 導入)" onSave={(nameRich, name) => onSave(s.id, { name, nameRich })} />
                  <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)} style={smallBtn}>
                    ↑
                  </button>
                  <button type="button" aria-label="下へ" disabled={i === steps.length - 1} onClick={() => move(i, 1)} style={smallBtn}>
                    ↓
                  </button>
                  <button type="button" onClick={() => setCopying([s.id])} style={{ ...smallBtn, flexShrink: 0 }}>
                    複製
                  </button>
                  <button type="button" onClick={() => onRemove(s)} style={{ ...smallBtn, color: 'var(--color-danger)', flexShrink: 0 }}>
                    削除
                  </button>
                </div>
                <RichEditor rich={s.bodyRich} plain={s.body} label={`${s.name}のトーク`} placeholder="トークの文面" onSave={(bodyRich, body) => onSave(s.id, { body, bodyRich })} />
                <span style={fieldLabel}>
                  よく出るアウト(押して切り替え。トークの下に最大{PIN_MAX}つ表示、他は「アウトを探す」の中。作成・編集は「アウト返し集」タブ)
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {hot.length === 0 && <span style={emptyText}>まだありません</span>}
                  {hot.map((o) => (
                    <OutChip
                      key={o.id}
                      label={o.label}
                      on={o.pinned}
                      muted={!o.pinned}
                      disabled={!o.pinned && pinnedCount >= PIN_MAX}
                      onClick={() => onPinOut(o.id, !o.pinned)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* 項目ごとの区切りが分かるよう、題名は大きく太く(要望) */}
                <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.4, paddingBottom: 3, borderBottom: '1px solid var(--color-border)' }}>
                  {i + 1}. <RichView rich={s.nameRich} plain={s.name} />
                </div>
                <div style={scriptText}>
                  <RichView rich={s.bodyRich} plain={s.body} />
                </div>
                {/* よく出るアウトだけトークの下に出し、他は「アウトを探す」にまとめる(要望: アウトが多すぎて見づらい) */}
                {outs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {pinned.length > 0 && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>よく出るアウト</span>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      {pinned.map((o) => {
                        const on = open?.stepId === s.id && open.outId === o.id;
                        return <OutChip key={o.id} label={o.label} on={on} onClick={() => setOpen(on ? null : { stepId: s.id, outId: o.id })} />;
                      })}
                      <button
                        type="button"
                        onClick={() => setFindStepId(s.id)}
                        style={{ fontSize: 12, padding: '1px 8px', borderStyle: 'dashed', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', boxShadow: 'none' }}
                      >
                        アウトを探す({hot.length})
                      </button>
                    </div>
                  </div>
                )}
                {ret && (
                  <div style={{ background: 'var(--color-appo-soft)', border: '1px solid var(--color-appo-border)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <b style={{ fontSize: 12, color: 'var(--color-appo)' }}>アウト返し: {ret.label}</b>
                    {ret.body ? (
                      <div style={scriptText}>
                        <RichView rich={ret.bodyRich} plain={ret.body} />
                      </div>
                    ) : (
                      <span style={emptyText}>アウト返しはまだ作成されていません</span>
                    )}
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setOpen(null);
                        onGoTo(ret.returnStepId ?? s.id);
                      }}
                      style={{ alignSelf: 'flex-end', fontSize: 12, padding: '3px 10px' }}
                    >
                      「{stepTitle(ret.returnStepId ?? s.id)}」に戻る
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
      {edit && (
        <button type="button" onClick={onAdd} style={{ alignSelf: 'flex-start', fontSize: 12 }}>
          ＋ トークを追加
        </button>
      )}
      {findStepId && (
        <OutFinder
          step={steps.find((x) => x.id === findStepId)!}
          stepTitle={stepTitle}
          stepOuts={outs.filter((o) => o.stepId === findStepId || (!o.stepId && steps.find((x) => x.id === findStepId)?.outIds.includes(o.id)))}
          rankOuts={outs}
          onClose={() => setFindStepId(null)}
          onGoTo={(id) => {
            setFindStepId(null);
            onGoTo(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * アウト返し集(要望: アウト返しだけで見られる)。ベーストークの項目ごとに並べ、押すとその場に文面が開く。
 * 作成時は項目をチェックで複数選べ、選んだ項目ごとに別々のアウト返しを作る(作ったあとは項目ごとに編集する)。
 */
function OutsTab({
  rank,
  steps,
  allSteps,
  outs,
  allOuts,
  edit,
  onGoTo,
  onSave,
  onRemove,
  onMove,
  onError,
}: {
  rank: string;
  steps: TalkStep[];
  allSteps: TalkStep[];
  outs: TalkOut[];
  allOuts: TalkOut[];
  edit: boolean;
  onGoTo: (stepId: string) => void;
  onSave: (id: string, patch: Partial<TalkOut>) => void;
  onRemove: (o: TalkOut) => void;
  onMove: (ids: string[]) => void;
  onError: (e: unknown) => void;
}) {
  const [q, setQ] = useState('');
  const stepTitle = (id: string | null) => {
    const i = steps.findIndex((x) => x.id === id);
    return i < 0 ? null : `${i + 1}. ${steps[i].name || '(名前未入力)'}`;
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // 分類で絞り込む(要望: アウトが多すぎて見づらい)
  const [cat, setCat] = useState<string | null>(null);

  const kw = q.trim().toLowerCase();
  const catOf = (o: TalkOut) => o.category || 'その他';
  const cats = [...new Set(outs.map(catOf))];
  // よく出るを各トークの先頭に
  const filtered = outs
    .filter((o) => (!kw || `${o.label} ${o.category} ${o.body}`.toLowerCase().includes(kw)) && (!cat || catOf(o) === cat))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  // ベーストークの項目ごと。項目に紐づかない以前のアウトは最後にまとめる
  const groups = [
    ...steps.map((st, i) => ({ key: st.id, name: `${i + 1}. ${st.name || '(名前未入力)'}`, items: filtered.filter((o) => o.stepId === st.id) })),
    { key: 'none', name: 'トーク未設定', items: filtered.filter((o) => !o.stepId) },
  ].filter((g) => g.items.length > 0 || (!kw && !cat && g.key !== 'none' && edit));
  const categories = [...new Set(allOuts.map((o) => o.category).filter(Boolean))];

  // 同じ項目の中で入れ替える
  const move = (group: TalkOut[], i: number, dir: -1 | 1) => {
    const other = group[i + dir];
    if (!other) return;
    const ids = allOuts.map((o) => o.id);
    const a = ids.indexOf(group[i].id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    onMove(ids);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="アウトを検索" placeholder="アウトを検索(例: 忙しい)" style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '3px 8px' }} />
        {edit && (
          <button type="button" className={creating ? 'btn-primary' : undefined} onClick={() => setCreating((v) => !v)} style={{ fontSize: 12, flexShrink: 0 }}>
            ＋ アウト返しを作成
          </button>
        )}
      </div>
      {cats.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          {[null, ...cats].map((c) => {
            const on = cat === c;
            return (
              <button
                key={c ?? 'all'}
                type="button"
                onClick={() => setCat(c)}
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  padding: '2px 10px',
                  borderRadius: 14,
                  ...(on ? { background: 'var(--color-primary)', color: 'var(--color-surface)', borderColor: 'var(--color-primary)', fontWeight: 700 } : {}),
                }}
              >
                {c ?? 'すべて'}
              </button>
            );
          })}
        </div>
      )}
      <datalist id="talk-out-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {creating && (
        <CreateOutForm
          rank={rank}
          allSteps={allSteps}
          onDone={(firstId) => {
            setCreating(false);
            setQ('');
            if (firstId) setOpenId(firstId);
          }}
          onError={onError}
        />
      )}
      {steps.length === 0 && <p style={emptyText}>このランクのベーストークがまだありません。先に「ベーストーク」で項目を作ると、項目ごとにアウト返しを作れます。</p>}
      {steps.length > 0 && outs.length === 0 && <p style={emptyText}>このランクのアウト返しはまだありません。{edit ? '' : '編集できる人が作成すると表示されます。'}</p>}
      {outs.length > 0 && filtered.length === 0 && <p style={emptyText}>該当するアウトがありません</p>}
      {groups.map((g) => (
        <div key={g.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ marginTop: 8, fontSize: 14, fontWeight: 800, paddingBottom: 2, borderBottom: '1px solid var(--color-border-strong)' }}>{g.name}</span>
          {g.items.length === 0 && <span style={emptyText}>まだありません</span>}
          {g.items.map((o, i) => {
            const open = openId === o.id;
            return (
              <div key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : o.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 9px',
                    fontSize: 13,
                    fontWeight: open ? 700 : 400,
                    background: open ? 'var(--color-appo)' : 'var(--color-surface)',
                    color: open ? 'var(--color-surface)' : undefined,
                    borderColor: open ? 'var(--color-appo)' : 'var(--color-border)',
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>{o.label || '(名前未入力)'}</span>
                  {o.pinned && <span style={{ fontSize: 10, fontWeight: 700, color: open ? 'inherit' : 'var(--color-appo)' }}>よく出る</span>}
                  {o.category && <span style={{ fontSize: 11, fontWeight: 400, color: open ? 'inherit' : 'var(--color-text-muted)' }}>{o.category}</span>}
                </button>
                {open && (
                  <div style={{ background: 'var(--color-appo-soft)', border: '1px solid var(--color-appo-border)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {edit ? (
                      <>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <span style={fieldLabel}>アウト</span>
                            <RichEditor singleLine rich={o.labelRich} plain={o.label} label="アウトの名前" placeholder="例: 今忙しい" onSave={(labelRich, label) => onSave(o.id, { label, labelRich })} />
                          </div>
                          <label style={{ flex: 1, minWidth: 0 }}>
                            <span style={fieldLabel}>分類</span>
                            <BlurText value={o.category} label="分類" placeholder="例: 時間・相手" list="talk-out-categories" onSave={(category) => onSave(o.id, { category })} />
                          </label>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={fieldLabel}>アウト返し(このトークだけに反映)</span>
                          <RichEditor rich={o.bodyRich} plain={o.body} label="アウト返しの文面" placeholder="お客様に話す内容" onSave={(bodyRich, body) => onSave(o.id, { body, bodyRich })} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                          <span style={fieldLabel}>トーク</span>
                          <select value={o.stepId ?? ''} onChange={(e) => e.target.value && onSave(o.id, { stepId: e.target.value })} style={{ fontSize: 12, maxWidth: 200 }}>
                            {!o.stepId && <option value="">(未設定)</option>}
                            {steps.map((st, si) => (
                              <option key={st.id} value={st.id}>
                                {si + 1}. {st.name || '(名前未入力)'}
                              </option>
                            ))}
                          </select>
                          <span style={fieldLabel}>戻るトーク</span>
                          <select value={o.returnStepId ?? ''} onChange={(e) => onSave(o.id, { returnStepId: e.target.value })} style={{ fontSize: 12, maxWidth: 200 }}>
                            <option value="">アウトが出たトーク</option>
                            {steps.map((st, si) => (
                              <option key={st.id} value={st.id}>
                                {si + 1}. {st.name || '(名前未入力)'}
                              </option>
                            ))}
                          </select>
                          <span style={{ flex: 1 }} />
                          <button type="button" aria-label="上へ" disabled={i === 0} onClick={() => move(g.items, i, -1)} style={smallBtn}>
                            ↑
                          </button>
                          <button type="button" aria-label="下へ" disabled={i === g.items.length - 1} onClick={() => move(g.items, i, 1)} style={smallBtn}>
                            ↓
                          </button>
                          <button type="button" onClick={() => onRemove(o)} style={{ ...smallBtn, color: 'var(--color-danger)' }}>
                            削除
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {o.body ? (
                          <div style={scriptText}>
                            <RichView rich={o.bodyRich} plain={o.body} />
                          </div>
                        ) : (
                          <span style={emptyText}>アウト返しはまだ作成されていません</span>
                        )}
                        {stepTitle(o.returnStepId ?? o.stepId) && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => onGoTo((o.returnStepId ?? o.stepId)!)}
                            style={{ alignSelf: 'flex-end', fontSize: 12, padding: '3px 10px' }}
                          >
                            「{stepTitle(o.returnStepId ?? o.stepId)}」に戻る
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * アウト返しの作成(要望)。反映するベーストークの項目をチェックで複数選ぶと、項目ごとに別々のアウト返しができる。
 * 他のランクの項目も選べる(今のランクを先頭に表示)。
 */
function CreateOutForm({
  rank,
  allSteps,
  onDone,
  onError,
}: {
  rank: string;
  allSteps: TalkStep[];
  onDone: (firstId: string | null) => void;
  onError: (e: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState<{ rich: RichRun[] | null; plain: string }>({ rich: null, plain: '' });
  const [category, setCategory] = useState('');
  const [body, setBody] = useState<{ rich: RichRun[] | null; plain: string }>({ rich: null, plain: '' });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // 戻るトーク: 'same'=アウトが出たトーク / 'next'=その次のトーク / 表示中のランクのトーク
  const [returnTo, setReturnTo] = useState('same');
  const rankSteps = allSteps.filter((s) => s.rank === rank);
  const ranks = [...TALK_RANKS].sort((a, b) => (a.id === rank ? -1 : b.id === rank ? 1 : 0));
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = useMutation({
    mutationFn: () =>
      api.post<TalkOut[]>('/talk-scripts/outs', {
        stepIds: [...picked],
        label: label.plain,
        labelRich: label.rich,
        category,
        body: body.plain,
        bodyRich: body.rich,
        returnTo,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['talk-scripts'] });
      onDone(created.find((o) => allSteps.find((s) => s.id === o.stepId)?.rank === rank)?.id ?? null);
    },
    onError,
  });

  return (
    <div className="card" style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--color-primary-border)' }}>
      <b style={{ fontSize: 13 }}>アウト返しを作成</b>
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={fieldLabel}>アウト</span>
          <RichEditor singleLine rich={label.rich} plain={label.plain} label="アウトの名前" placeholder="例: 今忙しい" onSave={(rich, plain) => setLabel({ rich, plain })} />
        </div>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={fieldLabel}>分類</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} list="talk-out-categories" placeholder="例: 時間・相手" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '3px 6px' }} />
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={fieldLabel}>アウト返し</span>
        <RichEditor rich={body.rich} plain={body.plain} label="アウト返しの文面" placeholder="お客様に話す内容" onSave={(rich, plain) => setBody({ rich, plain })} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={fieldLabel}>アウト返しのあとに戻るトーク</span>
        <select value={returnTo} onChange={(e) => setReturnTo(e.target.value)} style={{ fontSize: 12, maxWidth: 220 }}>
          <option value="same">アウトが出たトーク</option>
          <option value="next">アウトが出たトークの次のトーク</option>
          {rankSteps.map((s, i) => (
            <option key={s.id} value={s.id}>
              {i + 1}. {s.name || '(名前未入力)'}
            </option>
          ))}
        </select>
      </div>
      {returnTo !== 'same' && returnTo !== 'next' && (
        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>トークを指定したときは、他のランクに作るアウト返しは「アウトが出たトーク」に戻ります</span>
      )}
      <span style={fieldLabel}>反映するトーク(複数選べます。作成後はトークごとに別々に編集できます)</span>
      {ranks.map((r) => {
        const list = allSteps.filter((s) => s.rank === r.id);
        if (list.length === 0) return null;
        const all = list.every((s) => picked.has(s.id));
        return (
          <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
              {r.label}
              <button
                type="button"
                onClick={() =>
                  setPicked((cur) => {
                    const next = new Set(cur);
                    for (const s of list) {
                      if (all) next.delete(s.id);
                      else next.add(s.id);
                    }
                    return next;
                  })
                }
                style={{ ...smallBtn, fontWeight: 400 }}
              >
                {all ? 'すべて外す' : 'すべて選ぶ'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', paddingLeft: 14 }}>
              {list.map((s, i) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                  {i + 1}. {s.name || '(名前未入力)'}
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {allSteps.length === 0 && <span style={emptyText}>ベーストークの項目がまだありません</span>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        {picked.size > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{picked.size}つのトークに作成します</span>}
        <button type="button" onClick={() => onDone(null)} style={{ fontSize: 12 }}>
          やめる
        </button>
        <button type="button" className="btn-primary" disabled={picked.size === 0 || create.isPending} onClick={() => create.mutate()} style={{ fontSize: 12 }}>
          {create.isPending ? '作成中...' : '作成'}
        </button>
      </div>
    </div>
  );
}

/**
 * ベーストークの複製(要望: ブロンズ・シルバー・ゴールドのトークを、他のランクにそのまま作成する。編集画面で)。
 * 複製元のランクとトーク、複製先のランクをチェックで選ぶ。アウト返しも一緒に複製し、複製後はそれぞれ別々に編集できる。
 */
function CopyStepsForm({ rank, allSteps, initial, onDone }: { rank: string; allSteps: TalkStep[]; initial: string[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  // 項目の「複製」から開いたときはそのトークのランク、それ以外は表示中のランク以外でトークがあるランクから始める
  const firstSource =
    allSteps.find((s) => initial.includes(s.id))?.rank ??
    TALK_RANKS.find((r) => r.id !== rank && allSteps.some((s) => s.rank === r.id))?.id ??
    rank;
  const [source, setSource] = useState(firstSource);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  // 複製先: 他のランクから持ってくるときは表示中のランクを最初から選んでおく
  const [targets, setTargets] = useState<Set<string>>(new Set(firstSource !== rank ? [rank] : []));
  const [error, setError] = useState<string | null>(null);
  const steps = allSteps.filter((s) => s.rank === source);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const allPicked = steps.length > 0 && steps.every((s) => picked.has(s.id));
  const pickedIds = steps.filter((s) => picked.has(s.id)).map((s) => s.id);
  const label = (id: string) => TALK_RANKS.find((r) => r.id === id)?.label ?? id;

  const copy = useMutation({
    mutationFn: () => api.post<{ copied: number }>('/talk-scripts/steps/copy', { stepIds: pickedIds, ranks: [...targets] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talk-scripts'] });
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '複製できませんでした'),
  });

  const rankDot = (id: string) => <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: TALK_RANKS.find((r) => r.id === id)?.color }} />;

  return (
    <div className="card" style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--color-primary-border)' }}>
      <b style={{ fontSize: 13 }}>ランクのトークを複製して作成</b>
      <span style={fieldLabel}>複製元のランク</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingLeft: 4 }}>
        {TALK_RANKS.map((r) => {
          const count = allSteps.filter((s) => s.rank === r.id).length;
          return (
            <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: count ? 'pointer' : 'default', color: count ? undefined : 'var(--color-text-faint)' }}>
              <input
                type="radio"
                name="talk-copy-source"
                checked={source === r.id}
                disabled={count === 0}
                onChange={() => {
                  setSource(r.id);
                  setPicked(new Set());
                }}
              />
              {rankDot(r.id)}
              {r.label}
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>({count}件)</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={fieldLabel}>{label(source)}の複製するトーク</span>
        <button type="button" onClick={() => setPicked(allPicked ? new Set() : new Set(steps.map((s) => s.id)))} style={smallBtn}>
          {allPicked ? 'すべて外す' : 'すべて選ぶ'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', paddingLeft: 4 }}>
        {steps.length === 0 && <span style={emptyText}>このランクのトークはまだありません</span>}
        {steps.map((s, i) => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked((cur) => toggle(cur, s.id))} />
            {i + 1}. {s.name || '(名前未入力)'}
          </label>
        ))}
      </div>
      <span style={fieldLabel}>作成するランク(複数選べます)</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingLeft: 4 }}>
        {TALK_RANKS.map((r) => (
          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={targets.has(r.id)} onChange={() => setTargets((cur) => toggle(cur, r.id))} />
            {rankDot(r.id)}
            {r.label}
            {r.id === rank && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(表示中)</span>}
          </label>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>トークの名前・文面とアウト返しをそのまま作成します。作成先では最後に追加され、元のトークとは別々に編集できます。</span>
      {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        {pickedIds.length > 0 && targets.size > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {label(source)}の{pickedIds.length}件を{[...targets].map(label).join('・')}に作成します
          </span>
        )}
        <button type="button" onClick={onDone} style={{ fontSize: 12 }}>
          やめる
        </button>
        <button type="button" className="btn-primary" disabled={pickedIds.length === 0 || targets.size === 0 || copy.isPending} onClick={() => copy.mutate()} style={{ fontSize: 12 }}>
          {copy.isPending ? '作成中...' : '作成'}
        </button>
      </div>
    </div>
  );
}

/**
 * アウトを探す(要望: アウトが多すぎて見づらいので、よく出る以外はここにまとめる)。
 * 検索と分類で絞り込み、押すとその場でアウト返しが開く。検索したときは同じランクの他のトークのアウトも探す。
 */
function OutFinder({
  step,
  stepTitle,
  stepOuts,
  rankOuts,
  onClose,
  onGoTo,
}: {
  step: TalkStep;
  stepTitle: (id: string) => string;
  stepOuts: TalkOut[];
  rankOuts: TalkOut[];
  onClose: () => void;
  onGoTo: (stepId: string) => void;
}) {
  const isPhone = useIsPhone();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [openOut, setOpenOut] = useState<TalkOut | null>(null);
  const kw = q.trim().toLowerCase();
  const base = kw ? rankOuts.filter((o) => `${o.label} ${o.category} ${o.body}`.toLowerCase().includes(kw)) : stepOuts;
  const catOf = (o: TalkOut) => o.category || 'その他';
  const cats = [...new Set(base.map(catOf))];
  const items = base.filter((o) => !cat || catOf(o) === cat);
  // よく出るを先頭、その後は分類ごと(この トークのものを先に)
  const pinned = items.filter((o) => o.pinned && o.stepId === step.id);
  const others = items.filter((o) => !pinned.includes(o));
  const groups = [...new Set(others.map(catOf))].map((name) => ({ name, list: others.filter((o) => catOf(o) === name) }));

  const row = (o: TalkOut) => (
    <button
      key={o.id}
      type="button"
      onClick={() => setOpenOut(o)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        textAlign: 'left',
        padding: isPhone ? '9px 6px' : '6px 6px',
        fontSize: 13,
        border: 'none',
        borderBottom: '1px solid var(--color-sunken)',
        borderRadius: 0,
        background: 'transparent',
        boxShadow: 'none',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{o.label || '(名前未入力)'}</span>
      {o.stepId !== step.id && o.stepId && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{stepTitle(o.stepId)}</span>}
      {kw && o.category && <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>{o.category}</span>}
      <span style={{ color: 'var(--color-text-faint)' }}>›</span>
    </button>
  );
  const heading = (t: string) => <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', margin: '8px 0 2px' }}>{t}</div>;

  return (
    <div className="modal-backdrop" onClick={onClose} style={isPhone ? { alignItems: 'flex-end', padding: 0 } : undefined}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isPhone ? '100%' : 'min(520px, 96vw)',
          maxWidth: isPhone ? 'none' : 520,
          height: isPhone ? '80vh' : 'min(640px, calc(100vh - 48px))',
          padding: isPhone ? '12px 12px calc(14px + env(safe-area-inset-bottom))' : '14px 16px',
          borderRadius: isPhone ? '16px 16px 0 0' : undefined,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {openOut ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <button type="button" onClick={() => setOpenOut(null)} style={{ fontSize: 12 }}>
                ‹ 一覧へ
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
                閉じる
              </button>
            </div>
            <div style={{ background: 'var(--color-appo-soft)', border: '1px solid var(--color-appo-border)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
              <b style={{ fontSize: 12, color: 'var(--color-appo)' }}>アウト返し: {openOut.label}</b>
              {openOut.body ? (
                <div style={scriptText}>
                  <RichView rich={openOut.bodyRich} plain={openOut.body} />
                </div>
              ) : (
                <span style={emptyText}>アウト返しはまだ作成されていません</span>
              )}
              <button
                type="button"
                className="btn-primary"
                onClick={() => onGoTo(openOut.returnStepId ?? openOut.stepId ?? step.id)}
                style={{ alignSelf: 'flex-end', fontSize: 12, padding: '3px 10px' }}
              >
                「{stepTitle(openOut.returnStepId ?? openOut.stepId ?? step.id)}」に戻る
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <b style={{ flex: 1, fontSize: 14 }}>
                {stepTitle(step.id)} のアウト({stepOuts.length})
              </b>
              <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
                閉じる
              </button>
            </div>
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCat(null);
              }}
              aria-label="アウトを検索"
              placeholder="アウトを検索(例: 忙しい)"
              style={{ fontSize: 13, padding: '6px 9px', borderRadius: 8 }}
            />
            {cats.length > 1 && (
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 0 2px', flexShrink: 0 }}>
                {[null, ...cats].map((c) => {
                  const on = cat === c;
                  return (
                    <button
                      key={c ?? 'all'}
                      type="button"
                      onClick={() => setCat(c)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12,
                        padding: '3px 10px',
                        borderRadius: 14,
                        ...(on ? { background: 'var(--color-primary)', color: 'var(--color-surface)', borderColor: 'var(--color-primary)', fontWeight: 700 } : {}),
                      }}
                    >
                      {c ?? 'すべて'}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {items.length === 0 && <p style={{ ...emptyText, marginTop: 10 }}>{kw ? '該当するアウトがありません' : 'このトークのアウトはまだありません'}</p>}
              {kw && items.length > 0 && <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 6 }}>このランクのすべてのトークから探しています</div>}
              {pinned.length > 0 && (
                <>
                  {heading('よく出る')}
                  {pinned.map(row)}
                </>
              )}
              {groups.map((g) => (
                <div key={g.name}>
                  {heading(g.name)}
                  {g.list.map(row)}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
