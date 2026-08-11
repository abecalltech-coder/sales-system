import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { InlineText } from '../../components/InlineEdit';
import { useUsers, useDepartments, UserListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const ROLE_OPTIONS = [
  'ADMIN', 'MANAGER', 'LEADER', 'INSIDE_SALES', 'FIELD_SALES', 'ENTRY_OPERATOR', 'USER', 'VIEWER',
];

const STATUS_LABEL: Record<string, string> = { PENDING: '承認待ち', ACTIVE: '在籍中', SUSPENDED: '停止中', RETIRED: '退職済み' };

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

  const mutation = useMutation({
    mutationFn: () => api.post(`/users/${userId}/set-password`, { newPassword: value }),
    onSuccess: () => {
      setEditing(false);
      setValue('');
      onDone();
    },
    onError: (err) => onError(err instanceof ApiError ? err.message : 'パスワード変更に失敗しました'),
  });

  if (!editing) {
    return <button onClick={() => setEditing(true)}>パスワード変更</button>;
  }

  return (
    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="新しいパスワード"
        style={{ width: 130, fontSize: 12, padding: 3 }}
      />
      <button onClick={() => mutation.mutate()} disabled={!value || mutation.isPending}>
        設定
      </button>
      <button
        onClick={() => {
          setEditing(false);
          setValue('');
        }}
      >
        ×
      </button>
    </span>
  );
}

function PendingApprovalRow({
  user,
  departments,
  onApproved,
  onError,
}: {
  user: UserListItem;
  departments: { id: string; name: string }[] | undefined;
  onApproved: () => void;
  onError: (message: string) => void;
}) {
  const [departmentId, setDepartmentId] = useState('');
  const [roleCode, setRoleCode] = useState('USER');

  const approveMutation = useMutation({
    mutationFn: () =>
      api.post(`/users/${user.id}/approve`, {
        departmentId: departmentId || undefined,
        roleCodes: [roleCode],
      }),
    onSuccess: onApproved,
    onError: (err) => onError(err instanceof ApiError ? err.message : '承認に失敗しました'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.post(`/users/${user.id}/reject`),
    onSuccess: onApproved,
    onError: (err) => onError(err instanceof ApiError ? err.message : '却下に失敗しました'),
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
      <div style={{ width: 140 }}>{user.name}</div>
      <div style={{ flex: 1, color: '#6b7280' }}>{user.email}</div>
      <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ padding: 4 }}>
        <option value="">部署未設定</option>
        {departments?.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select value={roleCode} onChange={(e) => setRoleCode(e.target.value)} style={{ padding: 4 }}>
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
        承認
      </button>
      <button onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
        却下
      </button>
    </div>
  );
}

export function UsersAdminPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const pageSize = 20;
  const queryClient = useQueryClient();
  const { data, isLoading } = useUsers({ page, pageSize, keyword: keyword || undefined });
  const { data: pending } = useUsers({ page: 1, pageSize: 50, status: 'PENDING' });
  const { data: departments } = useDepartments();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', roleCodes: ['USER'], departmentId: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidateUsers = () => {
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

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
      setMessage(`ユーザーを作成しました。一時パスワード: ${res.tempPassword}(初回ログイン時に変更が必要です)`);
      setShowCreate(false);
      setForm({ email: '', name: '', roleCodes: ['USER'], departmentId: '' });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  const updateNameMutation = useMutation({
    mutationFn: (vars: { id: string; version: number; name: string }) =>
      api.patch(`/users/${vars.id}`, { version: vars.version, name: vars.name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
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
    { key: 'roles', label: 'ロール', render: (r) => r.roles.map((ur) => ur.role.name).join(', ') },
    { key: 'status', label: '在籍状態', render: (r) => STATUS_LABEL[r.status] ?? r.status, width: 100 },
    {
      key: 'actions',
      label: '操作',
      width: 180,
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <SetPasswordControl userId={r.id} onDone={() => setMessage(`「${r.name}」のパスワードを変更しました`)} onError={setError} />
          <button
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
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 style={{ fontSize: 20 }}>ユーザー管理</h1>
          <button onClick={() => setShowCreate((v) => !v)}>{showCreate ? '閉じる' : '＋ 新規ユーザー'}</button>
        </div>

        {message && <p style={{ color: '#16a34a', fontSize: 13, marginBottom: 12 }}>{message}</p>}
        {error && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {(pending?.items.length ?? 0) > 0 && (
          <div style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, marginBottom: 20 }}>
            <div style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, borderBottom: '1px solid #fde68a' }}>
              承認待ちのユーザー({pending?.items.length}件)
            </div>
            {pending?.items.map((u) => (
              <PendingApprovalRow key={u.id} user={u} departments={departments} onApproved={invalidateUsers} onError={setError} />
            ))}
          </div>
        )}

        {showCreate && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16, maxWidth: 480 }}>
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
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13 }}>ロール</label>
              <select
                value={form.roleCodes[0]}
                onChange={(e) => setForm({ ...form, roleCodes: [e.target.value] })}
                style={{ display: 'block', width: '100%', padding: 6 }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={() => createMutation.mutate()} disabled={!form.email || !form.name}>
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
      </div>
    </AppLayout>
  );
}
