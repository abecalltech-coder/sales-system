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
const rankLabel = (id: string) => TALK_RANKS.find((r) => r.id === id)?.label ?? id;

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
  /** このアウトを使うランク(複数なら同じ内容を使い回す) */
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
  const outs = useMemo(() => (data?.outs ?? []).filter((o) => o.ranks.includes(rank)), [data, rank]);

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
            outs={outs}
            allOuts={data?.outs ?? []}
            edit={edit}
            onSave={(id, patch) => saveOut.mutate({ id, patch })}
            onRemove={(o) => {
              const shared = o.ranks.length > 1 ? `\n${o.ranks.map(rankLabel).join('・')}のすべてから消えます。` : '';
              if (window.confirm(`「${o.label || 'このアウト'}」を削除しますか？${shared}`)) removeOut.mutate(o.id);
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
  steps,
  outs,
  edit,
  onSave,
  onAdd,
  onRemove,
  onMove,
}: {
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

  const move = (i: number, dir: -1 | 1) => {
    const ids = steps.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onMove(ids);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {steps.length === 0 && <p style={emptyText}>このランクのトークはまだありません。{edit ? '' : '編集できる人が作成すると表示されます。'}</p>}
      {steps.map((s, i) => {
        const hot = outs.filter((o) => s.outIds.includes(o.id));
        const rest = outs.filter((o) => !s.outIds.includes(o.id));
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
                  <button type="button" onClick={() => onRemove(s)} style={{ ...smallBtn, color: 'var(--color-danger)', flexShrink: 0 }}>
                    削除
                  </button>
                </div>
                <BlurText multiline value={s.body} label={`${s.name}のトーク`} placeholder="トークの文面" onSave={(body) => onSave(s.id, { body })} />
                <span style={fieldLabel}>このトークで出やすいアウト(押して選ぶ)</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {outs.length === 0 && <span style={emptyText}>「アウト返し集」タブでアウトを作成すると選べます</span>}
                  {outs.map((o) => (
                    <OutChip
                      key={o.id}
                      label={o.label}
                      on={s.outIds.includes(o.id)}
                      muted={!s.outIds.includes(o.id)}
                      onClick={() => onSave(s.id, { outIds: s.outIds.includes(o.id) ? s.outIds.filter((x) => x !== o.id) : [...s.outIds, o.id] })}
                    />
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
                        <OutChip key={o.id} label={o.label} on={on} muted={!s.outIds.includes(o.id)} onClick={() => setOpen(on ? null : { stepId: s.id, outId: o.id })} />
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

/** アウト返し集(要望: アウト返しだけで見られる)。分類ごとの一覧を押すと、その場に文面が開く */
function OutsTab({
  rank,
  steps,
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
  outs: TalkOut[];
  allOuts: TalkOut[];
  edit: boolean;
  onSave: (id: string, patch: Partial<TalkOut>) => void;
  onRemove: (o: TalkOut) => void;
  onMove: (ids: string[]) => void;
  onError: (e: unknown) => void;
}) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: () => api.post<TalkOut>('/talk-scripts/outs', { ranks: [rank], label: '新しいアウト' }),
    onSuccess: (o) => {
      setQ('');
      setOpenId(o.id);
      queryClient.invalidateQueries({ queryKey: ['talk-scripts'] });
    },
    onError,
  });

  const kw = q.trim().toLowerCase();
  const filtered = outs.filter((o) => !kw || `${o.label} ${o.category} ${o.body}`.toLowerCase().includes(kw));
  const groupOf = (o: TalkOut) => o.category || 'その他';
  const groups = [...new Set(filtered.map(groupOf))].map((name) => ({ name, items: filtered.filter((o) => groupOf(o) === name) }));
  const categories = [...new Set(allOuts.map((o) => o.category).filter(Boolean))];

  // 同じ分類の中で入れ替える
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
          <button type="button" disabled={add.isPending} onClick={() => add.mutate()} style={{ fontSize: 12, flexShrink: 0 }}>
            ＋ アウトを追加
          </button>
        )}
      </div>
      <datalist id="talk-out-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {outs.length === 0 && <p style={emptyText}>このランクのアウトはまだありません。{edit ? '' : '編集できる人が作成すると表示されます。'}</p>}
      {outs.length > 0 && filtered.length === 0 && <p style={emptyText}>該当するアウトがありません</p>}
      {groups.map((g) => (
        <div key={g.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ ...fieldLabel, marginTop: 4 }}>{g.name}</span>
          {g.items.map((o, i) => {
            const open = openId === o.id;
            const when = steps.filter((s) => s.outIds.includes(o.id)).map((s) => s.name).join('・');
            const others = o.ranks.filter((r) => r !== rank);
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
                  {when && <span style={{ fontSize: 11, fontWeight: 400, color: open ? 'inherit' : 'var(--color-text-muted)' }}>{when}</span>}
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
                          <span style={fieldLabel}>アウト返し</span>
                          <BlurText multiline value={o.body} label="アウト返しの文面" placeholder="お客様に話す内容" onSave={(body) => onSave(o.id, { body })} />
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12 }}>
                          <span style={fieldLabel}>使うランク</span>
                          {TALK_RANKS.map((r) => {
                            const checked = o.ranks.includes(r.id);
                            return (
                              <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  // 最低1つのランクには残す(消すときは「削除」)
                                  disabled={checked && o.ranks.length === 1}
                                  onChange={() => onSave(o.id, { ranks: checked ? o.ranks.filter((x) => x !== r.id) : [...o.ranks, r.id] })}
                                />
                                {r.label}
                              </label>
                            );
                          })}
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
                        {others.length > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{others.map(rankLabel).join('・')}と共通です。文面を変えると、そちらにも反映されます。</span>
                        )}
                      </>
                    ) : (
                      <>
                        {o.body ? <div style={scriptText}>{o.body}</div> : <span style={emptyText}>アウト返しはまだ作成されていません</span>}
                        {others.length > 0 && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{others.map(rankLabel).join('・')}と共通</span>}
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
