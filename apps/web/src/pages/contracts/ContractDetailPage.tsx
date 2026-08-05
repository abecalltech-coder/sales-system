import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../../components/AppLayout';
import { useContract, useStatuses } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';

export function ContractDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const { data: contract, isLoading } = useContract(id);
  const { data: statuses } = useStatuses('MATCHING');
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: (body: { version: number; matchingStatusId?: string }) => api.patch(`/contracts/${id}`, body),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : '更新に失敗しました'),
  });

  if (isLoading || !contract) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <Link to="/contracts" style={{ fontSize: 13 }}>
          ← 成約管理一覧へ戻る
        </Link>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>{contract.caseNumber}</h1>

        {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>マッチング状況</label>
          <select
            value={contract.matchingStatusId}
            onChange={(e) => updateMutation.mutate({ version: contract.version, matchingStatusId: e.target.value })}
            style={{ display: 'block', padding: 6, marginTop: 4 }}
          >
            {statuses?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>
            「マッチング完了」「スイッチング完了」へ変更すると、日付が未入力の場合は当日日付が自動入力されます。
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>マッチング日 / スイッチング日</label>
          <p>
            {contract.matchingAt ? new Date(contract.matchingAt).toLocaleDateString('ja-JP') : '未入力'} /{' '}
            {contract.switchingAt ? new Date(contract.switchingAt).toLocaleDateString('ja-JP') : '未入力'}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
