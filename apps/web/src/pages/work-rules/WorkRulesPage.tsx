import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useIsPhone } from '../../lib/useIsPhone';
import { api, ApiError } from '../../lib/api';

interface RuleGroup {
  id: string;
  name: string;
  order: number;
  count: number;
}

interface Rule {
  id: string;
  groupId: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
}

interface RulesData {
  canEdit: boolean;
  groups: RuleGroup[];
  rules: Rule[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * モーダルの枠。.modal には内側の余白が無いためここで付ける(要望: 余白が無く見づらい)。
 * スマホは画面幅いっぱい近くまで広げ、余白を多めに取る。
 */
const modalStyle = (isPhone: boolean, width: number) =>
  ({
    width: isPhone ? '100%' : `min(${width}px, 96vw)`,
    maxWidth: isPhone ? 'none' : width,
    boxSizing: 'border-box',
    padding: isPhone ? '20px 18px 22px' : '18px 20px',
    ...(isPhone ? { maxHeight: 'calc(var(--viewport-height, 100vh) - 32px)', borderRadius: 16 } : {}),
  }) as const;

/** グループの見分け用の色(トークンの色を順番に使う) */
const GROUP_COLORS = ['var(--color-primary)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-danger)', 'var(--color-text-muted)'];

const Dot = ({ color }: { color: string }) => <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />;

/**
 * 稼働ルール(要望: 様々なルールをグループ(ジャンル)ごとに一覧で確認できる)。
 * 閲覧は全員、作成・編集はユーザー管理の役職ごとの設定で許可した人だけ。本文はメモのように自由に書ける。
 */
export function WorkRulesPage() {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['work-rules'], queryFn: () => api.get<RulesData>('/work-rules') });
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = data?.groups ?? [];
  const canEdit = !!data?.canEdit;
  const colorOf = (groupId: string) => GROUP_COLORS[Math.max(0, groups.findIndex((g) => g.id === groupId)) % GROUP_COLORS.length];

  const sections = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const rules = (data?.rules ?? []).filter((r) => !kw || r.title.toLowerCase().includes(kw) || r.body.toLowerCase().includes(kw));
    return groups
      .filter((g) => !groupFilter || g.id === groupFilter)
      .map((g) => ({ group: g, rules: rules.filter((r) => r.groupId === g.id) }))
      .filter((s) => s.rules.length > 0 || (!kw && groupFilter === s.group.id));
  }, [data, groups, groupFilter, q]);

  const total = data?.rules.length ?? 0;
  const toggleExpand = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groupItem = (id: string | null, name: string, count: number, color: string) => {
    const on = groupFilter === id;
    if (isPhone) {
      return (
        <button
          key={id ?? 'all'}
          type="button"
          onClick={() => setGroupFilter(id)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 16,
            ...(on ? { background: 'var(--color-primary-soft)', color: 'var(--color-primary)', borderColor: 'var(--color-primary-border)' } : {}),
          }}
        >
          <Dot color={color} />
          {name} {count}
        </button>
      );
    }
    return (
      <div
        key={id ?? 'all'}
        onClick={() => setGroupFilter(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 7px',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer',
          ...(on ? { background: 'var(--color-primary-soft)', color: 'var(--color-primary)', fontWeight: 700 } : {}),
        }}
      >
        <Dot color={color} />
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--color-text-faint)' }}>{count}</span>
      </div>
    );
  };

  const groupList = [groupItem(null, 'すべて', total, 'var(--color-text-faint)'), ...groups.map((g) => groupItem(g.id, g.name, g.count, colorOf(g.id)))];

  return (
    <AppLayout>
      {/* スマホは余白を広めに取る(要望: 余白が無く見づらい) */}
      <div className="page" style={{ padding: isPhone ? '16px 16px 24px' : undefined }}>
        <div className="page-header" style={{ gap: 8, flexWrap: 'wrap', ...(isPhone ? { marginBottom: 12 } : {}) }}>
          <h1 className="page-title" style={{ flex: 1 }}>
            稼働ルール
          </h1>
          {!isPhone && <input placeholder="ルールを検索" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200, padding: '5px 7px', fontSize: 12 }} />}
          {canEdit && !isPhone && <button onClick={() => setGroupsOpen(true)}>グループ管理</button>}
          {canEdit && (
            <button className="btn-primary" onClick={() => setEditing('new')}>
              ＋ ルール作成
            </button>
          )}
        </div>

        {isPhone && (
          <>
            <input
              placeholder="ルールを検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', fontSize: 14, borderRadius: 8, marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 18, paddingBottom: 4 }}>
              {groupList}
              {canEdit && (
                <button type="button" onClick={() => setGroupsOpen(true)} style={{ flexShrink: 0, fontSize: 12, padding: '6px 12px', borderRadius: 16 }}>
                  グループ管理
                </button>
              )}
            </div>
          </>
        )}

        {isLoading ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {!isPhone && (
              <div style={{ width: 170, flexShrink: 0, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 6 }}>
                {groupList}
                {canEdit && (
                  <div onClick={() => setGroupsOpen(true)} style={{ padding: '5px 7px', fontSize: 12, color: 'var(--color-primary)', cursor: 'pointer' }}>
                    ＋ グループを追加
                  </div>
                )}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {groups.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>
                  {canEdit ? 'まだグループがありません。「グループ管理」からグループを作ってください' : 'まだルールがありません'}
                </p>
              )}
              {groups.length > 0 && sections.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>該当するルールがありません</p>}
              {sections.map(({ group, rules }) => (
                <div key={group.id} style={{ marginBottom: isPhone ? 24 : 12 }}>
                  <h2 style={{ fontSize: isPhone ? 14 : 13, margin: isPhone ? '0 0 10px 2px' : '0 0 5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Dot color={colorOf(group.id)} />
                    {group.name}
                    <span style={{ fontSize: 10, color: 'var(--color-text-faint)', fontWeight: 400 }}>{rules.length}件</span>
                  </h2>
                  {rules.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)', margin: 0 }}>まだルールがありません</p>}
                  {rules.map((r) => {
                    const open = expanded.has(r.id);
                    const long = r.body.split('\n').length > 3 || r.body.length > 180;
                    return (
                      <div
                        key={r.id}
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          borderRadius: isPhone ? 12 : 8,
                          padding: isPhone ? '14px 16px' : '8px 10px',
                          marginBottom: isPhone ? 12 : 6,
                          boxShadow: isPhone ? 'var(--shadow-sm)' : 'var(--shadow-xs)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? 8 : 6 }}>
                          {r.pinned && (
                            <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, background: 'var(--color-warning-soft)', color: 'var(--color-warning)', flexShrink: 0 }}>固定</span>
                          )}
                          <b style={{ fontSize: isPhone ? 14.5 : 13, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.title}</b>
                          {canEdit && (
                            <button type="button" onClick={() => setEditing(r)} style={{ fontSize: isPhone ? 12 : 11, padding: isPhone ? '4px 12px' : '1px 7px', flexShrink: 0 }}>
                              編集
                            </button>
                          )}
                        </div>
                        {r.body && (
                          <div
                            style={{
                              fontSize: isPhone ? 13.5 : 12,
                              lineHeight: isPhone ? 1.8 : undefined,
                              color: isPhone ? 'var(--color-text)' : 'var(--color-text-muted)',
                              whiteSpace: 'pre-wrap',
                              overflowWrap: 'anywhere',
                              marginTop: isPhone ? 10 : 3,
                              // 長い本文は3行ほどで切り、押すと全文を開く(要望の案)
                              ...(long && !open ? { maxHeight: isPhone ? 73 : 54, overflow: 'hidden' } : {}),
                            }}
                          >
                            {r.body}
                          </div>
                        )}
                        {long && (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => toggleExpand(r.id)}
                            style={{ fontSize: isPhone ? 12 : 11, padding: isPhone ? '6px 0 0' : '1px 0', color: 'var(--color-primary)' }}
                          >
                            {open ? '閉じる' : '続きを表示'}
                          </button>
                        )}
                        <div
                          style={{
                            fontSize: isPhone ? 11 : 10.5,
                            color: 'var(--color-text-faint)',
                            marginTop: isPhone ? 12 : 4,
                            display: 'flex',
                            gap: isPhone ? 4 : 10,
                            flexDirection: isPhone ? 'column' : 'row',
                            flexWrap: 'wrap',
                            ...(isPhone ? { paddingTop: 10, borderTop: '1px solid var(--color-sunken)' } : {}),
                          }}
                        >
                          <span>
                            作成 {fmt(r.createdAt)}
                            {r.createdByName ? `(${r.createdByName})` : ''}
                          </span>
                          <span>
                            最終編集 {fmt(r.updatedAt)}
                            {r.updatedByName ? `(${r.updatedByName})` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          groups={groups}
          defaultGroupId={groupFilter ?? groups[0]?.id ?? ''}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['work-rules'] });
            setEditing(null);
          }}
        />
      )}
      {groupsOpen && <GroupManager groups={groups} onClose={() => setGroupsOpen(false)} />}
    </AppLayout>
  );
}

/** ルールの作成・編集 */
function RuleEditor({
  rule,
  groups,
  defaultGroupId,
  onClose,
  onSaved,
}: {
  rule: Rule | null;
  groups: RuleGroup[];
  defaultGroupId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const [groupId, setGroupId] = useState(rule?.groupId ?? defaultGroupId);
  const [title, setTitle] = useState(rule?.title ?? '');
  const [body, setBody] = useState(rule?.body ?? '');
  const [pinned, setPinned] = useState(rule?.pinned ?? false);
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : '保存に失敗しました');

  const save = useMutation({
    mutationFn: () => {
      const payload = { groupId, title, body, pinned };
      return rule ? api.patch(`/work-rules/${rule.id}`, payload) : api.post('/work-rules', payload);
    },
    onSuccess: onSaved,
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/work-rules/${rule!.id}`),
    onSuccess: onSaved,
    onError: onErr,
  });
  // その場でグループを作って選ぶ
  const addGroup = useMutation({
    mutationFn: (name: string) => api.post<RuleGroup>('/work-rules/groups', { name }),
    onSuccess: (g) => {
      setGroupId(g.id);
      setNewGroup(null);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['work-rules'] });
    },
    onError: onErr,
  });

  const label = (text: string) => (
    <div style={{ fontSize: isPhone ? 12 : 11, color: 'var(--color-text-muted)', margin: isPhone ? '18px 0 6px' : '12px 0 4px', fontWeight: 700 }}>{text}</div>
  );
  // スマホは入力欄も大きめにして押しやすく・読みやすく
  const field = { padding: isPhone ? '10px 12px' : '6px 8px', fontSize: isPhone ? 14 : 12, borderRadius: 8 } as const;

  return (
    <div className="modal-backdrop" onClick={onClose} style={isPhone ? { padding: 12 } : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={modalStyle(isPhone, 620)}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0, fontSize: isPhone ? 16 : 15, flex: 1 }}>{rule ? 'ルールを編集' : 'ルールを作成'}</h3>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {label('グループ')}
        {newGroup === null ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...field, flex: 1, minWidth: 0 }}>
              {!groupId && <option value="">選んでください</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setNewGroup('')} style={{ flexShrink: 0 }}>
              ＋ 新しいグループ
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              placeholder="新しいグループ名"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newGroup.trim()) addGroup.mutate(newGroup.trim());
              }}
              style={{ ...field, flex: 1, minWidth: 0 }}
            />
            <button type="button" disabled={!newGroup.trim() || addGroup.isPending} onClick={() => addGroup.mutate(newGroup.trim())} style={{ flexShrink: 0 }}>
              作成
            </button>
            <button type="button" onClick={() => setNewGroup(null)} style={{ flexShrink: 0 }}>
              やめる
            </button>
          </div>
        )}
        {label('タイトル')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
        {label('本文')}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', minHeight: '36vh', lineHeight: 1.8, fontSize: isPhone ? 14 : 13, padding: isPhone ? '12px 14px' : '10px 12px', borderRadius: 8 }}
        />
        <label style={{ fontSize: isPhone ? 13 : 12, display: 'flex', gap: 6, alignItems: 'center', marginTop: isPhone ? 14 : 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          グループ内で上に固定
        </label>
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '10px 0 0' }}>{error}</p>}
        {/* スマホは日時を1行ずつ、ボタンの上に出す */}
        {rule && isPhone && (
          <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>
              作成 {fmt(rule.createdAt)}
              {rule.createdByName ? `(${rule.createdByName})` : ''}
            </span>
            <span>
              最終編集 {fmt(rule.updatedAt)}
              {rule.updatedByName ? `(${rule.updatedByName})` : ''}
            </span>
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isPhone ? 10 : 8,
            marginTop: isPhone ? 14 : 14,
            paddingTop: isPhone ? 14 : 12,
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span style={{ fontSize: 10.5, color: 'var(--color-text-faint)', flex: 1 }}>
            {rule &&
              !isPhone &&
              `作成 ${fmt(rule.createdAt)}${rule.createdByName ? `(${rule.createdByName})` : ''}・最終編集 ${fmt(rule.updatedAt)}${rule.updatedByName ? `(${rule.updatedByName})` : ''}`}
          </span>
          {rule && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`「${rule.title}」を削除しますか？`)) remove.mutate();
              }}
              style={{ color: 'var(--color-danger)', padding: isPhone ? '9px 16px' : undefined, fontSize: isPhone ? 13 : undefined }}
            >
              削除
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!groupId || !title.trim() || save.isPending}
            onClick={() => save.mutate()}
            style={{ padding: isPhone ? '9px 28px' : '6px 20px', fontSize: isPhone ? 13 : undefined }}
          >
            {save.isPending ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** グループの追加・名前の変更・並び替え・削除 */
function GroupManager({ groups, onClose }: { groups: RuleGroup[]; onClose: () => void }) {
  const isPhone = useIsPhone();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['work-rules'] });
  };
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : '操作に失敗しました');

  const add = useMutation({
    mutationFn: () => api.post('/work-rules/groups', { name }),
    onSuccess: () => {
      setName('');
      done();
    },
    onError: onErr,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; name?: string; order?: number }) => api.patch(`/work-rules/groups/${v.id}`, { name: v.name, order: v.order }),
    onSuccess: done,
    onError: onErr,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/work-rules/groups/${id}`),
    onSuccess: done,
    onError: onErr,
  });
  // 表示順どおりに order を振り直す
  const move = async (index: number, dir: -1 | 1) => {
    const next = [...groups];
    const [g] = next.splice(index, 1);
    next.splice(index + dir, 0, g);
    try {
      for (const [i, x] of next.entries()) if (x.order !== i + 1) await api.patch(`/work-rules/groups/${x.id}`, { order: i + 1 });
      done();
    } catch (e) {
      onErr(e);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={isPhone ? { padding: 12 } : undefined}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={modalStyle(isPhone, 440)}>
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, marginBottom: 6, borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ margin: 0, fontSize: isPhone ? 16 : 15, flex: 1 }}>グループ管理</h3>
          <button type="button" onClick={onClose}>
            閉じる
          </button>
        </div>
        {groups.length === 0 && <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>まだグループがありません</p>}
        {groups.map((g, i) => (
          <div key={g.id} style={{ display: 'flex', gap: isPhone ? 8 : 6, alignItems: 'center', padding: isPhone ? '10px 0' : '6px 0', borderBottom: '1px solid var(--color-sunken)' }}>
            <span style={{ display: 'inline-flex', flexDirection: 'column', flexShrink: 0 }}>
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} title="上へ" style={{ width: 18, height: 12, padding: 0, fontSize: 8, lineHeight: 1 }}>
                ▲
              </button>
              <button type="button" disabled={i === groups.length - 1} onClick={() => move(i, 1)} title="下へ" style={{ width: 18, height: 12, padding: 0, fontSize: 8, lineHeight: 1 }}>
                ▼
              </button>
            </span>
            <Dot color={GROUP_COLORS[i % GROUP_COLORS.length]} />
            <input
              key={g.name}
              defaultValue={g.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== g.name) update.mutate({ id: g.id, name: v });
              }}
              style={{ flex: 1, minWidth: 0, padding: isPhone ? '8px 10px' : '5px 7px', fontSize: isPhone ? 14 : 12, borderRadius: 8 }}
            />
            <span style={{ fontSize: 10.5, color: 'var(--color-text-faint)', flexShrink: 0 }}>{g.count}件</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`グループ「${g.name}」を削除しますか？`)) remove.mutate(g.id);
              }}
              style={{ fontSize: 11, color: 'var(--color-danger)', flexShrink: 0 }}
            >
              削除
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: isPhone ? 16 : 12 }}>
          <input
            placeholder="新しいグループ名"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) add.mutate();
            }}
            style={{ flex: 1, minWidth: 0, padding: isPhone ? '10px 12px' : '6px 8px', fontSize: isPhone ? 14 : 12, borderRadius: 8 }}
          />
          <button type="button" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()} style={{ padding: isPhone ? '9px 18px' : undefined }}>
            追加
          </button>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '6px 0 0' }}>{error}</p>}
        <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: '10px 0 0', lineHeight: 1.6 }}>ルールが入っているグループは削除できません(先に別のグループへ移動してください)</p>
      </div>
    </div>
  );
}
