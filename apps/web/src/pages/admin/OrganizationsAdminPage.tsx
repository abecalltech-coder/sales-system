import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useDepartments } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function OrganizationsAdminPage() {
  const { data: departments, isLoading } = useDepartments();
  const queryClient = useQueryClient();
  const [newDeptName, setNewDeptName] = useState('');
  const [newTeamName, setNewTeamName] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const createDept = useMutation({
    mutationFn: (name: string) => api.post('/organizations/departments', { name }),
    onSuccess: () => {
      setNewDeptName('');
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
  });

  const createTeam = useMutation({
    mutationFn: (vars: { departmentId: string; name: string }) => api.post('/organizations/teams', vars),
    onSuccess: (_, vars) => {
      setNewTeamName({ ...newTeamName, [vars.departmentId]: '' });
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '作成に失敗しました'),
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
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>組織管理</h1>
        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        {departments?.map((dept) => (
          <div key={dept.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{dept.name}</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, marginBottom: 8 }}>
              {dept.teams.map((team) => (
                <li key={team.id}>{team.name}</li>
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
