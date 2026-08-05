import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useEntry, useStatuses } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function EntryDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: entry, isLoading } = useEntry(id);
  const { data: statuses } = useStatuses('ENTRY');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (body: { version: number; statusId?: string; deficiencyNote?: string }) =>
      api.patch(`/entries/${id}`, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['entries'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  if (isLoading || !entry) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <Link to="/entries" style={{ fontSize: 13 }}>
          ← エントリー管理一覧へ戻る
        </Link>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>{entry.caseNumber}</h1>

        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>エントリーステータス</label>
          <select
            value={entry.statusId}
            onChange={(e) => updateMutation.mutate({ version: entry.version, statusId: e.target.value })}
            style={{ display: 'block', padding: 6, marginTop: 4 }}
          >
            {statuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>不備内容</label>
          <p>{entry.deficiencyNote ?? 'なし'}</p>
        </div>
      </div>
    </AppLayout>
  );
}
