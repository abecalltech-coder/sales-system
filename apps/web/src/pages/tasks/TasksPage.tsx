import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useDepartments, useMe, useUserOptions } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { IMPORTANCE, REMIND_OPTIONS, REPEAT_OPTIONS, RepeatType, TaskItem, WEEKDAYS, fmtDue, repeatLabel, useTasks } from '../../lib/tasks';

/** タスク(要望)。自分・他の人・部署全体・All のタスクを1つの一覧で、上から期日順に表示する */
export function TasksPage() {
  const [includeDone, setIncludeDone] = useState(false);
  const { data: tasks, isLoading } = useTasks(includeDone);
  const [editing, setEditing] = useState<TaskItem | 'new' | null>(null);
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // 通知の「編集」から ?edit=<id> で開かれたら、そのタスクの編集画面を開く
  const editId = params.get('edit');
  useEffect(() => {
    if (!editId || !tasks) return;
    const t = tasks.find((x) => x.id === editId);
    if (t) setEditing(t);
    params.delete('edit');
    setParams(params, { replace: true });
  }, [editId, tasks, params, setParams]);

  const act = useMutation({
    mutationFn: (v: { id: string; action: 'complete' | 'reopen' | 'delete' }) =>
      v.action === 'delete' ? api.delete(`/tasks/${v.id}`) : api.post(`/tasks/${v.id}/${v.action}`, {}),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '操作できませんでした'),
  });

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">タスク</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={includeDone} onChange={(e) => setIncludeDone(e.target.checked)} />
              完了済みも表示
            </label>
            <button type="button" className="btn-primary" onClick={() => setEditing('new')}>
              ＋ タスク作成
            </button>
          </div>
        </div>
        {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}

        <div className="m-card-list">
          {isLoading && <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
          {!isLoading && (tasks ?? []).length === 0 && <p style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>タスクはありません</p>}
          {(tasks ?? []).map((t) => (
            <TaskRow
              key={t.id}
              t={t}
              onComplete={() => act.mutate({ id: t.id, action: 'complete' })}
              onReopen={() => act.mutate({ id: t.id, action: 'reopen' })}
              onEdit={() => setEditing(t)}
              onDelete={() => window.confirm(`「${t.title}」を削除しますか？`) && act.mutate({ id: t.id, action: 'delete' })}
            />
          ))}
        </div>
      </div>
      {editing && <TaskEditor task={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </AppLayout>
  );
}

const CATEGORY_STYLE: Record<string, React.CSSProperties> = {
  ALL: { background: '#f3e8ff', color: '#6b21a8' },
  DEPARTMENT: { background: '#e0f2fe', color: '#075985' },
  PERSONAL: { background: '#f1f5f9', color: '#334155' },
};

function TaskRow({ t, onComplete, onReopen, onEdit, onDelete }: { t: TaskItem; onComplete: () => void; onReopen: () => void; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const imp = IMPORTANCE[t.importance] ?? IMPORTANCE[3];
  const repeat = repeatLabel(t);
  const remind = REMIND_OPTIONS.find((o) => o.value === t.remindMinutes)?.label;
  return (
    <div style={{ padding: '7px 10px', borderBottom: '1px solid var(--color-sunken)', opacity: t.doneByMe ? 0.55 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <span title={`重要度 ${t.importance}`} style={{ flexShrink: 0, fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: imp.color, color: imp.text }}>
          {t.importance} {imp.label}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ flex: '1 1 220px', minWidth: 0, padding: 0, border: 'none', background: 'transparent', boxShadow: 'none', textAlign: 'left', font: 'inherit', color: 'inherit' }}
        >
          <span style={{ fontSize: 14, fontWeight: 900, textDecoration: t.doneByMe ? 'line-through' : undefined }}>{t.title}</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            {/* 個人/部署/All が分かるように(要望) */}
            {t.categories.map((c, i) => (
              <span key={i} style={{ fontSize: 10.5, padding: '0 6px', borderRadius: 4, ...CATEGORY_STYLE[c.kind] }}>
                {c.label}
              </span>
            ))}
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 3, fontSize: 11.5, color: t.overdue ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
            <span>
              {t.overdue ? '期限切れ ' : ''}
              {fmtDue(t.currentDueAt)}
            </span>
            {repeat && <span>繰り返し: {repeat}</span>}
            {t.currentDueAt && remind && <span>通知: {remind}</span>}
            {t.targetCount > 1 && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProgress(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.stopPropagation();
                    setShowProgress(true);
                  }
                }}
                title="誰が完了/未完了か見る"
                style={{ color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                完了 {t.doneCount}/{t.targetCount}人
              </span>
            )}
            <span>作成: {t.createdByName}</span>
          </span>
        </button>
        <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {t.isMine &&
            (t.doneByMe ? (
              t.repeatType === 'NONE' && (
                <button type="button" onClick={onReopen} style={{ fontSize: 11, padding: '3px 8px' }}>
                  未完了に戻す
                </button>
              )
            ) : (
              <button type="button" className="btn-primary" onClick={onComplete} style={{ fontSize: 11, padding: '3px 10px' }}>
                完了
              </button>
            ))}
          {t.canEdit && (
            <>
              <button type="button" onClick={onEdit} style={{ fontSize: 11, padding: '3px 8px' }}>
                編集
              </button>
              <button type="button" onClick={onDelete} style={{ fontSize: 11, padding: '3px 8px', color: 'var(--color-danger)' }}>
                削除
              </button>
            </>
          )}
        </span>
      </div>
      {open && t.detail && <p style={{ margin: '6px 0 0 4px', fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{t.detail}</p>}
      {showProgress && <ProgressSheet task={t} onClose={() => setShowProgress(false)} />}
    </div>
  );
}

/** 担当者ごとの完了状況(要望: 数字を押すと誰が完了で誰が未完了か分かる) */
function ProgressSheet({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', 'progress', task.id],
    queryFn: () =>
      api.get<{ occurrence: string | null; done: { id: string; name: string; doneAt: string | null }[]; notDone: { id: string; name: string }[] }>(
        `/tasks/${task.id}/progress`,
      ),
  });
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380, width: '100%', padding: 14, maxHeight: '80vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 14, margin: '0 0 2px' }}>{task.title}</h2>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 10px' }}>{data?.occurrence ? `${fmtDue(data.occurrence)} の回` : '期日なし'}</p>
        {isLoading && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>}
        {data && (
          <>
            <h3 style={{ fontSize: 12, margin: '0 0 4px', color: 'var(--color-danger)' }}>未完了 {data.notDone.length}人</h3>
            {data.notDone.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: '0 0 8px' }}>なし</p>}
            {data.notDone.map((u) => (
              <div key={u.id} style={{ fontSize: 13, padding: '3px 0', borderBottom: '1px solid var(--color-sunken)' }}>
                {u.name}
              </div>
            ))}
            <h3 style={{ fontSize: 12, margin: '12px 0 4px', color: 'var(--color-success)' }}>完了 {data.done.length}人</h3>
            {data.done.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>なし</p>}
            {data.done.map((u) => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', borderBottom: '1px solid var(--color-sunken)' }}>
                <span>{u.name}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>{fmt(u.doneAt)}</span>
              </div>
            ))}
          </>
        )}
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 作成・編集

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalParts(iso: string | null) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function TaskEditor({ task, onClose }: { task: TaskItem | null; onClose: () => void }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const due = toLocalParts(task?.dueAt ?? null);
  const [form, setForm] = useState({
    title: task?.title ?? '',
    detail: task?.detail ?? '',
    targetAll: task?.targetAll ?? false,
    targetDepartmentIds: task?.targetDepartmentIds ?? [],
    targetUserIds: task?.targetUserIds ?? (me ? [me.id] : []),
    date: due.date,
    time: due.time || '10:00',
    importance: task?.importance ?? 3,
    remindMinutes: task ? task.remindMinutes : 30,
    repeatType: (task?.repeatType ?? 'NONE') as RepeatType,
    repeatInterval: task?.repeatInterval ?? 1,
    repeatWeekdays: task?.repeatWeekdays ?? [],
    repeatUntil: toLocalParts(task?.repeatUntil ?? null).date,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  const save = useMutation({
    mutationFn: () => {
      const dueAt = form.date ? new Date(`${form.date}T${form.time || '00:00'}`).toISOString() : null;
      const body = {
        title: form.title,
        detail: form.detail,
        targetAll: form.targetAll,
        targetDepartmentIds: form.targetDepartmentIds,
        targetUserIds: form.targetUserIds,
        dueAt,
        importance: form.importance,
        remindMinutes: form.remindMinutes,
        repeatType: form.repeatType,
        repeatInterval: Math.max(1, Number(form.repeatInterval) || 1),
        repeatWeekdays: form.repeatWeekdays,
        repeatUntil: form.repeatUntil ? new Date(`${form.repeatUntil}T00:00`).toISOString() : null,
      };
      return task ? api.patch(`/tasks/${task.id}`, body) : api.post('/tasks', body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '保存できませんでした'),
  });

  const repeatUnit = REPEAT_OPTIONS.find((o) => o.value === form.repeatType)?.unit;
  const row: React.CSSProperties = { display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', alignItems: 'center', gap: 8, padding: '5px 0' };
  const lab: React.CSSProperties = { fontSize: 11.5, color: 'var(--color-text-muted)' };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, width: '100%', padding: 14, maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>{task ? 'タスクを編集' : 'タスクを作成'}</h2>

        <div style={row}>
          <span style={lab}>誰のタスク</span>
          <TargetPicker
            value={{ all: form.targetAll, departmentIds: form.targetDepartmentIds, userIds: form.targetUserIds }}
            onChange={(v) => set({ targetAll: v.all, targetDepartmentIds: v.departmentIds, targetUserIds: v.userIds })}
          />
        </div>
        <label style={row}>
          <span style={lab}>タスク名</span>
          <input value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="例: 月次報告の提出" style={{ fontSize: 14 }} />
        </label>
        <label style={{ ...row, alignItems: 'start' }}>
          <span style={{ ...lab, paddingTop: 6 }}>詳細</span>
          <textarea value={form.detail} onChange={(e) => set({ detail: e.target.value })} rows={4} style={{ fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
        </label>
        <div style={row}>
          <span style={lab}>期日・時間</span>
          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} style={{ fontSize: 13 }} />
            <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} style={{ fontSize: 13 }} />
            {form.date && (
              <button type="button" onClick={() => set({ date: '', repeatType: 'NONE' })} style={{ fontSize: 11, padding: '2px 8px' }}>
                期日なしにする
              </button>
            )}
          </span>
        </div>
        <label style={row}>
          <span style={lab}>リマインド</span>
          <select
            value={form.remindMinutes === null ? '' : String(form.remindMinutes)}
            onChange={(e) => set({ remindMinutes: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={!form.date}
            style={{ fontSize: 13 }}
          >
            {REMIND_OPTIONS.map((o) => (
              <option key={String(o.value)} value={o.value === null ? '' : String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div style={{ ...row, alignItems: 'start' }}>
          <span style={{ ...lab, paddingTop: 6 }}>繰り返し</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={form.repeatType} onChange={(e) => set({ repeatType: e.target.value as RepeatType })} disabled={!form.date} style={{ fontSize: 13 }}>
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {repeatUnit && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  <input type="number" min={1} value={form.repeatInterval} onChange={(e) => set({ repeatInterval: Number(e.target.value) })} style={{ width: 56, fontSize: 13 }} />
                  {repeatUnit}
                </span>
              )}
            </span>
            {form.repeatType === 'WEEKDAYS' && (
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {WEEKDAYS.map((w, i) => (
                  <label key={w} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={form.repeatWeekdays.includes(i)}
                      onChange={(e) => set({ repeatWeekdays: e.target.checked ? [...form.repeatWeekdays, i].sort() : form.repeatWeekdays.filter((d) => d !== i) })}
                    />
                    {w}
                  </label>
                ))}
              </span>
            )}
            {form.repeatType !== 'NONE' && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                終了日(任意)
                <input type="date" value={form.repeatUntil} onChange={(e) => set({ repeatUntil: e.target.value })} style={{ fontSize: 13 }} />
              </span>
            )}
          </span>
        </div>
        <div style={row}>
          <span style={lab}>重要度</span>
          <span role="radiogroup" aria-label="重要度" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const imp = IMPORTANCE[n];
              const on = form.importance === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ importance: n })}
                  style={{
                    fontSize: 12,
                    padding: '4px 10px',
                    background: on ? imp.color : 'var(--color-surface)',
                    color: on ? imp.text : imp.color,
                    borderColor: imp.color,
                  }}
                >
                  {n} {imp.label}
                </button>
              );
            })}
          </span>
        </div>

        {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
          <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
            キャンセル
          </button>
          <button type="button" className="btn-primary" disabled={save.isPending || !form.title.trim()} onClick={() => save.mutate()} style={{ fontSize: 12 }}>
            {save.isPending ? '保存中...' : task ? '保存' : '作成'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 誰のタスクか(要望: プルダウンの中にチェックボックスで複数選択。部署全体・All も選べる)。
 */
function TargetPicker({
  value,
  onChange,
}: {
  value: { all: boolean; departmentIds: string[]; userIds: string[] };
  onChange: (v: { all: boolean; departmentIds: string[]; userIds: string[] }) => void;
}) {
  const { data: me } = useMe();
  const { data: users } = useUserOptions();
  const { data: departments } = useDepartments();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const userName = (id: string) => (id === me?.id ? '自分' : (users?.find((u) => u.id === id)?.name ?? '?'));
  const summary = [
    ...(value.all ? ['All'] : []),
    ...value.departmentIds.map((id) => `${departments?.find((d) => d.id === id)?.name ?? '?'}全体`),
    ...value.userIds.map(userName),
  ];
  const others = (users ?? []).filter((u) => u.id !== me?.id && (!q || u.name.includes(q)));
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', fontSize: 13, cursor: 'pointer' };
  const head: React.CSSProperties = { padding: '6px 10px 2px', fontSize: 10.5, color: 'var(--color-text-faint)' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', minHeight: 32, textAlign: 'left', fontSize: 13, padding: '4px 28px 4px 8px', position: 'relative', whiteSpace: 'normal' }}
      >
        {summary.length ? summary.join('、') : '選択してください'}
        <span aria-hidden style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10 }}>
          ▼
        </span>
      </button>
      {open && (
        <div className="popover" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 50, maxHeight: 320, overflowY: 'auto', padding: '2px 0' }}>
          {me && (
            <label style={item}>
              <input type="checkbox" checked={value.userIds.includes(me.id)} onChange={() => onChange({ ...value, userIds: toggle(value.userIds, me.id) })} />
              自分
            </label>
          )}
          <label style={item}>
            <input type="checkbox" checked={value.all} onChange={(e) => onChange({ ...value, all: e.target.checked })} />
            All(全員)
          </label>
          <div style={head}>部署全体</div>
          {(departments ?? []).map((d) => (
            <label key={d.id} style={item}>
              <input type="checkbox" checked={value.departmentIds.includes(d.id)} onChange={() => onChange({ ...value, departmentIds: toggle(value.departmentIds, d.id) })} />
              {d.name}全体
            </label>
          ))}
          <div style={head}>個人</div>
          <div style={{ padding: '2px 10px 4px' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前で検索" style={{ width: '100%', fontSize: 12, height: 28 }} />
          </div>
          {others.map((u) => (
            <label key={u.id} style={item}>
              <input type="checkbox" checked={value.userIds.includes(u.id)} onChange={() => onChange({ ...value, userIds: toggle(value.userIds, u.id) })} />
              {u.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
