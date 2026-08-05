import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { CommentsPanel } from '../../components/CommentsPanel';
import { useTossCase, useStatuses } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function TossCaseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: tossCase, isLoading } = useTossCase(id);
  const { data: statuses } = useStatuses('TOSS');
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | undefined>(undefined);

  const updateMutation = useMutation({
    mutationFn: (body: { version: number; statusId?: string; memo?: string }) =>
      api.patch(`/toss-cases/${id}`, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['toss-cases'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  if (isLoading || !tossCase) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <Link to="/toss-cases" style={{ fontSize: 13 }}>
          ← トス実績管理一覧へ戻る
        </Link>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>{tossCase.caseNumber}</h1>

        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>ステータス</label>
          <select
            value={tossCase.statusId}
            onChange={(e) => updateMutation.mutate({ version: tossCase.version, statusId: e.target.value })}
            style={{ display: 'block', padding: 6, marginTop: 4 }}
          >
            {statuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            「アポイント」へ変更すると、アポ案件が自動作成されます。
          </p>
        </div>

        {tossCase.appointment && (
          <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            アポ案件が作成済みです: {tossCase.appointment.caseNumber}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>法人名</label>
          <p>{tossCase.customer?.corporateName ?? '-'}</p>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>顧客担当者 / 電話番号</label>
          <p>
            {tossCase.customer?.contactName ?? '-'} / {tossCase.customer?.phone ?? '-'}
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>メモ</label>
          <textarea
            defaultValue={tossCase.memo ?? ''}
            onChange={(e) => setMemo(e.target.value)}
            style={{ display: 'block', width: '100%', minHeight: 80, marginTop: 4 }}
          />
          <button
            style={{ marginTop: 8 }}
            disabled={memo === undefined}
            onClick={() => updateMutation.mutate({ version: tossCase.version, memo })}
          >
            メモを保存
          </button>
        </div>

        <CommentsPanel entityType="TOSS_CASE" entityId={id} />
      </div>
    </AppLayout>
  );
}
