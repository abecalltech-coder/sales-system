import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { api, ApiError } from '../../lib/api';

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
  /** このトークで出やすいアウト */
  outIds: string[];
}

interface TalkOut {
  id: string;
  /** どのベーストークの項目のアウト返しか(項目ごとに別々に編集する)。null は項目に紐づかない以前のアウト */
  stepId: string | null;
  /** このアウトを使うランク(項目に紐づくものはその項目のランク) */
  ranks: string[];
  label: string;
  category: string;
  body: string;
}

interface TalkData {
  canEdit: boolean;
  myRank: string | null;
  steps: TalkStep[];
  outs: TalkOut[];
}

const smallBtn: React.CSSProperties = { fontSize: 11, padding: '1px 7px' };
const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)' };
const scriptText: React.CSSProperties = { fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
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
function OutChip({ label, on, muted, onClick }: { label: string; on?: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
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
            outs={outs}
            edit={edit}
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
  outs,
  edit,
  onSave,
  onAdd,
  onRemove,
  onMove,
}: {
  rank: string;
  steps: TalkStep[];
  outs: TalkOut[];
  edit: boolean;
  onSave: (id: string, patch: Partial<TalkStep>) => void;
  onAdd: () => void;
  onRemove: (s: TalkStep) => void;
  onMove: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState<{ stepId: string; outId: string } | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
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
      {edit && steps.length > 0 && (
        <button type="button" className={copying ? 'btn-primary' : undefined} onClick={() => setCopying(copying ? null : [])} style={{ alignSelf: 'flex-end', fontSize: 12 }}>
          他のランクへ複製
        </button>
      )}
      {copying && <CopyStepsForm key={copying.join(',')} rank={rank} steps={steps} initial={copying} onDone={() => setCopying(null)} />}
      {steps.length === 0 && <p style={emptyText}>このランクのトークはまだありません。{edit ? '' : '編集できる人が作成すると表示されます。'}</p>}
      {steps.map((s, i) => {
        // この項目のアウト返し(以前の共有アウトは項目に選ばれていたもの)
        const isHot = (o: TalkOut) => o.stepId === s.id || (!o.stepId && s.outIds.includes(o.id));
        const hot = outs.filter(isHot);
        const rest = outs.filter((o) => !isHot(o));
        const showRest = moreId === s.id;
        const ret = open?.stepId === s.id ? outs.find((o) => o.id === open.outId) : undefined;
        return (
          <div key={s.id} className="card" style={{ padding: '6px 9px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {edit ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ ...fieldLabel, flexShrink: 0 }}>{i + 1}.</span>
                  <BlurText value={s.name} label="トークの名前" placeholder="トークの名前(例: 導入)" onSave={(name) => onSave(s.id, { name })} />
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
                <BlurText multiline value={s.body} label={`${s.name}のトーク`} placeholder="トークの文面" onSave={(body) => onSave(s.id, { body })} />
                <span style={fieldLabel}>このトークのアウト返し(作成・編集は「アウト返し集」タブ)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {hot.length === 0 && <span style={emptyText}>まだありません</span>}
                  {hot.map((o) => (
                    <span key={o.id} style={{ fontSize: 12, padding: '1px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-appo-border)', background: 'var(--color-appo-soft)', color: 'var(--color-appo)' }}>
                      {o.label || '(名前未入力)'}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  {i + 1}. {s.name}
                </span>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{s.body}</div>
                {outs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {[...hot, ...(showRest ? rest : [])].map((o) => {
                      const on = open?.stepId === s.id && open.outId === o.id;
                      return (
                        <OutChip key={o.id} label={o.label} on={on} muted={!isHot(o)} onClick={() => setOpen(on ? null : { stepId: s.id, outId: o.id })} />
                      );
                    })}
                    {!showRest && rest.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMoreId(s.id)}
                        style={{ background: 'none', border: 'none', boxShadow: 'none', color: 'var(--color-primary)', fontSize: 12, padding: '1px 4px' }}
                      >
                        その他のアウト
                      </button>
                    )}
                  </div>
                )}
                {ret && (
                  <div style={{ background: 'var(--color-appo-soft)', border: '1px solid var(--color-appo-border)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <b style={{ fontSize: 12, color: 'var(--color-appo)' }}>アウト返し: {ret.label}</b>
                    {ret.body ? <div style={scriptText}>{ret.body}</div> : <span style={emptyText}>アウト返しはまだ作成されていません</span>}
                    <button type="button" className="btn-primary" onClick={() => setOpen(null)} style={{ alignSelf: 'flex-end', fontSize: 12, padding: '3px 10px' }}>
                      閉じてトークに戻る
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
  onSave: (id: string, patch: Partial<TalkOut>) => void;
  onRemove: (o: TalkOut) => void;
  onMove: (ids: string[]) => void;
  onError: (e: unknown) => void;
}) {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const kw = q.trim().toLowerCase();
  const filtered = outs.filter((o) => !kw || `${o.label} ${o.category} ${o.body}`.toLowerCase().includes(kw));
  // ベーストークの項目ごと。項目に紐づかない以前のアウトは最後にまとめる
  const groups = [
    ...steps.map((st, i) => ({ key: st.id, name: `${i + 1}. ${st.name || '(名前未入力)'}`, items: filtered.filter((o) => o.stepId === st.id) })),
    { key: 'none', name: 'トーク未設定', items: filtered.filter((o) => !o.stepId) },
  ].filter((g) => g.items.length > 0 || (!kw && g.key !== 'none' && edit));
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
          <span style={{ ...fieldLabel, marginTop: 6, fontSize: 12, color: 'var(--color-text)' }}>{g.name}</span>
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
                  {o.category && <span style={{ fontSize: 11, fontWeight: 400, color: open ? 'inherit' : 'var(--color-text-muted)' }}>{o.category}</span>}
                </button>
                {open && (
                  <div style={{ background: 'var(--color-appo-soft)', border: '1px solid var(--color-appo-border)', borderRadius: 'var(--radius-sm)', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {edit ? (
                      <>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <label style={{ flex: 2, minWidth: 0 }}>
                            <span style={fieldLabel}>アウト</span>
                            <BlurText value={o.label} label="アウトの名前" placeholder="例: 今忙しい" onSave={(label) => onSave(o.id, { label })} />
                          </label>
                          <label style={{ flex: 1, minWidth: 0 }}>
                            <span style={fieldLabel}>分類</span>
                            <BlurText value={o.category} label="分類" placeholder="例: 時間・相手" list="talk-out-categories" onSave={(category) => onSave(o.id, { category })} />
                          </label>
                        </div>
                        <label>
                          <span style={fieldLabel}>アウト返し(このトークだけに反映)</span>
                          <BlurText multiline value={o.body} label="アウト返しの文面" placeholder="お客様に話す内容" onSave={(body) => onSave(o.id, { body })} />
                        </label>
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
                    ) : o.body ? (
                      <div style={scriptText}>{o.body}</div>
                    ) : (
                      <span style={emptyText}>アウト返しはまだ作成されていません</span>
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
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('');
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const ranks = [...TALK_RANKS].sort((a, b) => (a.id === rank ? -1 : b.id === rank ? 1 : 0));
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = useMutation({
    mutationFn: () => api.post<TalkOut[]>('/talk-scripts/outs', { stepIds: [...picked], label, category, body }),
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
        <label style={{ flex: 2, minWidth: 0 }}>
          <span style={fieldLabel}>アウト</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 今忙しい" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '3px 6px' }} />
        </label>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span style={fieldLabel}>分類</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} list="talk-out-categories" placeholder="例: 時間・相手" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '3px 6px' }} />
        </label>
      </div>
      <label>
        <span style={fieldLabel}>アウト返し</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="お客様に話す内容" style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '3px 6px', lineHeight: 1.55 }} />
      </label>
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
 * ベーストークの複製(要望: ブロンズ・シルバー・ゴールドへチェック式で複製)。
 * 複製する項目と複製先のランクをチェックで選ぶ。項目のアウト返しも一緒に複製し、複製後はそれぞれ別々に編集できる。
 */
function CopyStepsForm({ rank, steps, initial, onDone }: { rank: string; steps: TalkStep[]; initial: string[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set(initial));
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const allPicked = steps.length > 0 && steps.every((s) => picked.has(s.id));

  const copy = useMutation({
    mutationFn: () => api.post<{ copied: number }>('/talk-scripts/steps/copy', { stepIds: steps.filter((s) => picked.has(s.id)).map((s) => s.id), ranks: [...targets] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talk-scripts'] });
      onDone();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '複製できませんでした'),
  });

  return (
    <div className="card" style={{ padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: 6, borderColor: 'var(--color-primary-border)' }}>
      <b style={{ fontSize: 13 }}>他のランクへ複製</b>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={fieldLabel}>複製するトーク</span>
        <button type="button" onClick={() => setPicked(allPicked ? new Set() : new Set(steps.map((s) => s.id)))} style={smallBtn}>
          {allPicked ? 'すべて外す' : 'すべて選ぶ'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', paddingLeft: 4 }}>
        {steps.map((s, i) => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => setPicked((cur) => toggle(cur, s.id))} />
            {i + 1}. {s.name || '(名前未入力)'}
          </label>
        ))}
      </div>
      <span style={fieldLabel}>複製先のランク(複数選べます)</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingLeft: 4 }}>
        {TALK_RANKS.map((r) => (
          <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={targets.has(r.id)} onChange={() => setTargets((cur) => toggle(cur, r.id))} />
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
            {r.label}
            {r.id === rank && <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(このランクに追加)</span>}
          </label>
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>アウト返しも一緒に複製します。複製先では最後に追加され、元のトークとは別々に編集できます。</span>
      {error && <span style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        {picked.size > 0 && targets.size > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {picked.size}件 × {targets.size}ランクに複製します
          </span>
        )}
        <button type="button" onClick={onDone} style={{ fontSize: 12 }}>
          やめる
        </button>
        <button type="button" className="btn-primary" disabled={picked.size === 0 || targets.size === 0 || copy.isPending} onClick={() => copy.mutate()} style={{ fontSize: 12 }}>
          {copy.isPending ? '複製中...' : '複製'}
        </button>
      </div>
    </div>
  );
}
