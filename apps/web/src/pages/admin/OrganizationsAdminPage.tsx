import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useDepartments, DepartmentItem, TeamItem } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function OrganizationsAdminPage() {
  const { data: departments, isLoading } = useDepartments();
  const queryClient = useQueryClient();
  const [newDeptName, setNewDeptName] = useState('');
  const [newTeamName, setNewTeamName] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['departments'] });
  const onErr = (e: unknown) => setError(e instanceof ApiError ? e.message : '操作に失敗しました');

  const createDept = useMutation({
    mutationFn: (name: string) => api.post('/organizations/departments', { name }),
    onSuccess: () => {
      setNewDeptName('');
      setError(null);
      invalidate();
    },
    onError: onErr,
  });

  const updateDept = useMutation({
    mutationFn: (v: { id: string; version: number; patch: { name?: string; active?: boolean } }) =>
      api.patch(`/organizations/departments/${v.id}`, { version: v.version, ...v.patch }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onErr,
  });

  const createTeam = useMutation({
    mutationFn: (vars: { departmentId: string; name: string }) => api.post('/organizations/teams', vars),
    onSuccess: (_, vars) => {
      setNewTeamName({ ...newTeamName, [vars.departmentId]: '' });
      setError(null);
      invalidate();
    },
    onError: onErr,
  });

  const updateTeam = useMutation({
    mutationFn: (v: { id: string; version: number; patch: { name?: string; active?: boolean } }) =>
      api.patch(`/organizations/teams/${v.id}`, { version: v.version, ...v.patch }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: onErr,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page" style={{ maxWidth: 640 }}>
        <h1 className="page-title" style={{ marginBottom: 10 }}>組織管理</h1>
        {error && <p style={{ color: 'crimson', fontSize: 13, marginBottom: 10 }}>{error}</p>}

        {departments?.map((dept: DepartmentItem) => (
          <div key={dept.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <input
                defaultValue={dept.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== dept.name) updateDept.mutate({ id: dept.id, version: dept.version, patch: { name: v } });
                }}
                style={{ fontWeight: 600, fontSize: 13, padding: '4px 6px', flex: 1 }}
              />
              <button
                className="btn-danger btn-sm"
                onClick={() => {
                  if (window.confirm(`「${dept.name}」を削除しますか？(この部署に所属するチーム・ユーザーの割り当ては残りますが、一覧の選択肢からは消えます)`)) {
                    updateDept.mutate({ id: dept.id, version: dept.version, patch: { active: false } });
                  }
                }}
              >
                削除
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, fontSize: 13, marginBottom: 8, listStyle: 'none' }}>
              {dept.teams.map((team: TeamItem) => (
                <li key={team.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <input
                    defaultValue={team.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== team.name) updateTeam.mutate({ id: team.id, version: team.version, patch: { name: v } });
                    }}
                    style={{ fontSize: 12, padding: '3px 6px', flex: 1 }}
                  />
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => {
                      if (window.confirm(`「${team.name}」を削除しますか？(所属ユーザーの割り当ては残りますが、一覧の選択肢からは消えます)`)) {
                        updateTeam.mutate({ id: team.id, version: team.version, patch: { active: false } });
                      }
                    }}
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="新しいチーム名"
                value={newTeamName[dept.id] ?? ''}
                onChange={(e) => setNewTeamName({ ...newTeamName, [dept.id]: e.target.value })}
                style={{ padding: 4, fontSize: 13, flex: 1 }}
              />
              <button
                onClick={() => createTeam.mutate({ departmentId: dept.id, name: newTeamName[dept.id] ?? '' })}
                disabled={!newTeamName[dept.id]}
              >
                チーム追加
              </button>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <input
            placeholder="新しい部署名"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            style={{ padding: 6, fontSize: 13, flex: 1 }}
          />
          <button onClick={() => createDept.mutate(newDeptName)} disabled={!newDeptName}>
            部署を追加
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
