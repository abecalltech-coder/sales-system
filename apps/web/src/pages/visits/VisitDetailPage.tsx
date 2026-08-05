import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '../../components/AppLayout';
import { CommentsPanel } from '../../components/CommentsPanel';
import { useVisit, useStatuses } from '../../hooks/useApi';

export function VisitDetailPage() {
  const { id = '' } = useParams();
  const { data: visit, isLoading } = useVisit(id);
  const { data: statuses } = useStatuses('VISIT');

  const statusLabel = (statusId: string) => statuses?.find((s) => s.id === statusId)?.displayName ?? statusId;

  if (isLoading || !visit) {
    return (
      <AppLayout>
        <div style={{ padding: 24 }}>読み込み中...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <Link to="/visits" style={{ fontSize: 13 }}>
          ← 訪問管理一覧へ戻る
        </Link>
        <h1 style={{ fontSize: 20, margin: '12px 0' }}>{visit.caseNumber}</h1>

        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          訪問到着・商談開始/終了はモバイル版から操作します。PC版はここでは状況確認のみ行えます。
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>ステータス</label>
          <p>{statusLabel(visit.statusId)}</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>訪問予定日時</label>
          <p>{new Date(visit.scheduledAt).toLocaleString('ja-JP')}</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>到着日時</label>
          <p>{visit.arrivedAt ? new Date(visit.arrivedAt).toLocaleString('ja-JP') : '未到着'}</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>商談結果</label>
          <p>{visit.meetingSession?.meetingResult ?? '未入力'}</p>
        </div>

        <CommentsPanel entityType="VISIT" entityId={id} />
      </div>
    </AppLayout>
  );
}
