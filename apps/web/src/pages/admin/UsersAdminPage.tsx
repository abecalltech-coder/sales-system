import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { DataTable, Column } from '../../components/DataTable';
import { useUsers, useDepartments, UserListItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

const ROLE_OPTIONS = [
  'ADMIN', 'MANAGER', 'LEADER', 'INSIDE_SALES', 'FIELD_SALES', 'ENTRY_OPERATOR', 'USER', 'VIEWER',
];

const STATUS_LABEL: Record<string, string> = { ACTIVE: '在籍中', SUSPENDED: '停止中', RETIRED: '退職済み' };

export function UsersAdminPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const pageSize = 20;
  const queryClient = useQueryClient();
  const { data, isLoading } = useUsers({ page, pageSize, keyword: keyword || undefined });
  const { data: departments } = useDepartments();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', roleCodes: ['USER'], departmentId: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => api.post<{ tempPassword: string }>(`/users/${id}/reset-password`),
    onSuccess: (res) => setMessage(`一時パスワードを再発行しました: ${res.tempPassword}`),
  });

  const suspendMutation = useMutation({
    mutationFn: (u: UserListItem) => api.patch(`/users/${u.id}`, { version: u.version, status: 'SUSPENDED' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const columns: Column<UserListItem>[] = [
    { key: 'name', label: '氏名', render: (r) => r.name, width: 140 },
    { key: 'email', label: 'メールアドレス', render: (r) => r.email },
    { key: 'roles', label: 'ロール', render: (r) => r.roles.map((ur) => ur.role.name).join(', ') },
    { key: 'status', label: '在籍状態', render: (r) => STATUS_LABEL[r.status] ?? r.status, width: 100 },
    {
      key: 'actions',
      label: '操作',
      width: 180,
      render: (r) => (
        <div style={{ display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => resetPasswordMutation.mutate(r.id)}>PW再発行</button>
          {r.status === 'ACTIVE' && <button onClick={() => suspendMutation.mutate(r)}>停止</button>}
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
