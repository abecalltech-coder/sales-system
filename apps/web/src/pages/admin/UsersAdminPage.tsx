import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText } from '../../components/InlineEdit';
import { useUsers, useDepartments, useRoles, UserListItem, RoleItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { ALL_NAV_TABS } from '../../lib/navTabs';

// 役職(要望: 各アカウントに必ず役職を付与する)。この4つのうち最低1つの選択を必須にする。
const POSITION_ROLE_CODES = ['AP', 'AP_LEADER', 'CL', 'RESPONSIBLE'];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'システム管理者',
  ADMIN: '業務管理者',
  MANAGER: '部署責任者',
  LEADER: 'チームリーダー',
  INSIDE_SALES: 'トス・アポ担当',
  FIELD_SALES: '訪問営業',
  ENTRY_OPERATOR: 'エントリー担当',
  USER: '一般ユーザー',
  VIEWER: '閲覧専用',
  AP: 'AP',
  AP_LEADER: 'APリーダー',
  CL: 'CL',
  RESPONSIBLE: '責任者',
};

const ROLE_OPTIONS = [
  'AP',
  'AP_LEADER',
  'CL',
  'RESPONSIBLE',
  'MANAGER',
  'LEADER',
  'INSIDE_SALES',
  'FIELD_SALES',
  'ENTRY_OPERATOR',
  'ADMIN',
  'USER',
  'VIEWER',
];

const STATUS_LABEL: Record<string, string> = { PENDING: '承認待ち', ACTIVE: '在籍中', SUSPENDED: '停止中', RETIRED: '退職済み' };

function hasPosition(roleCodes: string[]) {
  return roleCodes.some((c) => POSITION_ROLE_CODES.includes(c));
}

function RoleCheckboxList({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
}) {
  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px 10px' }}>
      {ROLE_OPTIONS.map((code) => (
        <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(code)} onChange={() => toggle(code)} />
          {ROLE_LABELS[code] ?? code}
          {POSITION_ROLE_CODES.includes(code) && (
            <span style={{ fontSize: 9, color: 'var(--color-primary)' }}>役職</span>
          )}
        </label>
      ))}
    </div>
  );
}

/**
 * パスワードはハッシュ化して保存しており復元表示できないため、管理者が直接
 * 新しいパスワードを入力・設定できるようにしたコントロール(要望)。
 */
function SetPasswordControl({
  userId,
  onDone,
  onError,
}: {
  userId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(`/users/${userId}/set-password`, { newPassword: value }),
    onSuccess: () => {
      setEditing(false);
      setValue('');
      onDone();
    },
    onError: (err) => onError(err instanceof ApiError ? err.message : 'パスワード変更に失敗しました'),
  });

  // テーブルのtdはoverflow:hiddenのため、position:absoluteだとポップオーバーが
  // セル内で切れてしまう。position:fixedで実座標を計算し、祖先のクリッピングを回避する。
  useLayoutEffect(() => {
    if (!editing || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
        setValue('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [editing]);

  return (
    <span ref={containerRef} style={{ display: 'inline-block' }}>
      <button ref={anchorRef} style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => setEditing((v) => !v)}>
        パスワード変更
      </button>
      {editing && pos && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            zIndex: 1000,
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            padding: 8,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="新しいパスワード"
            style={{ width: 140, fontSize: 12, padding: 4 }}
          />
          <button style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => mutation.mutate()} disabled={!value || mutation.isPending}>
            設定
          </button>
          <button
            style={{ fontSize: 12, padding: '3px 8px' }}
            onClick={() => {
              setEditing(false);
              setValue('');
            }}
          >
            キャンセル
          </button>
        </div>
      )}
    </span>
  );
}

/** ロール(役職含む)をその場で編集するポップオーバー(要望: 既存アカウントへの役職の後付け)。 */
function RolesControl({
  user,
  onSave,
  onError,
}: {
  user: UserListItem;
  onSave: (codes: string[]) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentCodes = user.roles.map((ur) => ur.role.code);

  useLayoutEffect(() => {
    if (!editing || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [editing]);

  const open = () => {
    setDraft(currentCodes);
    setEditing(true);
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        {currentCodes.length ? currentCodes.map((c) => ROLE_LABELS[c] ?? c).join(', ') : '未設定'}
        {!hasPosition(currentCodes) && (
          <span title="役職が未設定です" style={{ marginLeft: 5, color: 'var(--color-danger)', fontSize: 11 }}>
            ⚠役職未設定
          </span>
        )}
      </span>
      <button ref={anchorRef} onClick={open} style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0 }}>
        編集
      </button>
      {editing && pos && (
        <div
          ref={containerRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 1000,
            width: 320,
            padding: 10,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          <RoleCheckboxList selected={draft} onChange={setDraft} />
          {!hasPosition(draft) && (
            <p style={{ color: 'var(--color-danger)', fontSize: 11, marginTop: 6 }}>
              役職(AP/APリーダー/CL/責任者)が選ばれていません
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
            <button style={{ fontSize: 12, padding: '3px 8px' }} onClick={() => setEditing(false)}>
              キャンセル
            </button>
            <button
              className="btn-primary"
              style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={() => {
                if (!hasPosition(draft) && !window.confirm('役職が設定されていませんが保存しますか？')) return;
                if (draft.length === 0) {
                  onError('ロールを1つ以上選択してください');
                  return;
                }
                onSave(draft);
                setEditing(false);
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/** 役職ごとのタブ表示設定(要望: ユーザー管理でチェックボックス設定)。 */
function TabVisibilitySettings() {
  const { data: roles, isLoading } = useRoles();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (v: { id: string; visibleTabs: string[] | null }) =>
      api.patch(`/roles/${v.id}`, { visibleTabs: v.visibleTabs }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '更新に失敗しました'),
  });

  // 対象は表示上の全ロール(要望: 管理タブも含めて全タブ対象)。SUPER_ADMINは常に全表示のため対象外にする。
  const configurableRoles = (roles ?? []).filter((r) => r.code !== 'SUPER_ADMIN');
  const groups = Array.from(new Set(ALL_NAV_TABS.map((t) => t.group)));

  const toggle = (role: RoleItem, tabKey: string) => {
    // null(制限なし)の状態でどれか1つ外す時は、まず「全タブ」から出発して該当タブだけ外す
    const current = role.visibleTabs ?? ALL_NAV_TABS.map((t) => t.key);
    const next = current.includes(tabKey) ? current.filter((k) => k !== tabKey) : [...current, tabKey];
    updateMutation.mutate({ id: role.id, visibleTabs: next });
  };

  const resetToAll = (role: RoleItem) => updateMutation.mutate({ id: role.id, visibleTabs: null });

  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>役職ごとのタブ表示設定</h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
        チェックを外すと、そのロールを持つユーザーのサイドナビからタブが消えます(未チェック=非表示)。SUPER_ADMINは締め出し防止のため常に全タブ表示です。
      </p>
      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 10 }}>{error}</p>}
      {isLoading ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {configurableRoles.map((role) => {
            const isAll = role.visibleTabs == null;
            const current = role.visibleTabs ?? ALL_NAV_TABS.map((t) => t.key);
            return (
              <div key={role.id} className="card" style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>{ROLE_LABELS[role.code] ?? role.name}</strong>
                  {isAll ? (
                    <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>(全タブ表示)</span>
                  ) : (
                    <button style={{ fontSize: 10, padding: '1px 6px' }} onClick={() => resetToAll(role)}>
                      全タブ表示に戻す
                    </button>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 }}>
                  {groups.map((g) => (
                    <div key={g}>
                      {ALL_NAV_TABS.filter((t) => t.group === g).map((t) => (
                        <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, padding: '1px 0', cursor: 'pointer' }}>
                          <input type="checkbox" checked={current.includes(t.key)} onChange={() => toggle(role, t.key)} />
                          {t.label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function UsersAdminPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const pageSize = 20;
  const queryClient = useQueryClient();
  const { data, isLoading } = useUsers({ page, pageSize, keyword: keyword || undefined });
  const { data: departments } = useDepartments();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', roleCodes: [] as string[], departmentId: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<{ user: UserListItem; tempPassword: string }>('/users', {
        email: form.email,
        name: form.name,
        roleCodes: form.roleCodes,
        departmentId: form.departmentId || undefined,
      }),
    onSuccess: (res) => {
      setError(null);
      setMessage(`ユーザーを作成しました。初期パスワード: ${res.tempPassword}(このパスワードでそのままログインできます。変更する場合は管理者が再設定してください)`);
      setShowCreate(false);
      setForm({ email: '', name: '', roleCodes: [], departmentId: '' });
      invalidateUsers();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  const updateNameMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; name: string }) =>
      api.patch(`/users/${vars.id}`, { version: vars.version, name: vars.name }),
    onSuccess: invalidateUsers,
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const updateRolesMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; roleCodes: string[] }) =>
      api.patch(`/users/${vars.id}`, { version: vars.version, roleCodes: vars.roleCodes }),
    onSuccess: invalidateUsers,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'ロールの更新に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidateUsers,
    onError: (err) => setError(err instanceof ApiError ? err.message : '削除に失敗しました'),
  });

  const columns: Column<UserListItem>[] = [
    {
      key: 'name',
      label: '氏名',
      width: 140,
      render: (r) => <InlineText value={r.name} onSave={(v) => updateNameMutation.mutate({ id: r.id, version: r.version, name: v })} />,
    },
    { key: 'email', label: 'メールアドレス', render: (r) => r.email },
    {
      key: 'roles',
      label: 'ロール(役職)',
      width: 340,
      render: (r) => (
        <RolesControl
          user={r}
          onSave={(codes) => updateRolesMutation.mutate({ id: r.id, version: r.version, roleCodes: codes })}
          onError={setError}
        />
      ),
    },
    { key: 'status', label: '在籍状態', render: (r) => STATUS_LABEL[r.status] ?? r.status, width: 100 },
    {
      key: 'actions',
      label: '操作',
      width: 210,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <SetPasswordControl userId={r.id} onDone={() => setMessage(`「${r.name}」のパスワードを変更しました`)} onError={setError} />
          <button
            style={{ fontSize: 12, padding: '3px 8px' }}
            onClick={() => {
              if (window.confirm(`「${r.name}」を削除しますか？この操作は取り消せません。`)) deleteMutation.mutate(r.id);
            }}
          >
            削除
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">ユーザー管理</h1>
          <button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '閉じる' : '＋ 新規ユーザー'}</button>
        </div>

        {message && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{message}</p>}
        {error && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {showCreate && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16, maxWidth: 460 }}>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>メールアドレス</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                style={{ display: 'block', width: '100%', padding: 6 }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>氏名</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={{ display: 'block', width: '100%', padding: 6 }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13 }}>所属部署</label>
              <select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                style={{ display: 'block', width: '100%', padding: 6 }}
              >
                <option value="">未設定</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                ロール(<span style={{ color: 'var(--color-primary)' }}>役職</span>を最低1つ選択してください)
              </label>
              <RoleCheckboxList selected={form.roleCodes} onChange={(codes) => setForm({ ...form, roleCodes: codes })} />
            </div>
            {form.roleCodes.length > 0 && !hasPosition(form.roleCodes) && (
              <p style={{ color: 'var(--color-danger)', fontSize: 11, marginBottom: 8 }}>
                役職(AP/APリーダー/CL/責任者)が選ばれていません
              </p>
            )}
            <button
              onClick={() => createMutation.mutate()}
              disabled={!form.email || !form.name || !hasPosition(form.roleCodes) || createMutation.isPending}
            >
              作成する
            </button>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <input
            placeholder="氏名・メールアドレスで検索"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
            style={{ padding: 6, fontSize: 13, width: 280 }}
          />
        </div>

        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={pageSize}
          loading={isLoading}
          onPageChange={setPage}
          getRowId={(r) => r.id}
        />

        <TabVisibilitySettings />
      </div>
    </AppLayout>
  );
}
