import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useAppointment, useStatuses } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function AppointmentDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: appointment, isLoading } = useAppointment(id);
  const { data: statuses } = useStatuses('APPOINTMENT');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (body: { version: number; meetingStatusId?: string }) => api.patch(`/appointments/${id}`, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  const retryCalendarMutation = useMutation({
    mutationFn: () => api.post(`/appointments/${id}/retry-calendar`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments', id] }),
  });

  if (isLoading || !appointment) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <Link to="/appointments" style={{ fontSize: 13 }}>
          ← アポ実績管理一覧へ戻る
        </Link>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>{appointment.caseNumber}</h1>

        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>商談ステータス</label>
          <select
            value={appointment.meetingStatusId}
            onChange={(e) => updateMutation.mutate({ version: appointment.version, meetingStatusId: e.target.value })}
            style={{ display: 'block', padding: 6, marginTop: 4 }}
          >
            {statuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            「成約」へ変更すると、成約案件が自動作成されます。
          </p>
        </div>

        {appointment.contract && (
          <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            成約案件が作成済みです: {appointment.contract.caseNumber}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>カレンダー連携状態</label>
          <p>{appointment.calendarSyncStatus}</p>
          {appointment.calendarSyncStatus === 'ERROR' && (
            <button onClick={() => retryCalendarMutation.mutate()} style={{ marginTop: 4 }}>
              カレンダー連携を再試行
            </button>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>訪問先住所</label>
          <p>{appointment.visitAddress ?? '-'}</p>
        </div>
      </div>
    </AppLayout>
  );
}
