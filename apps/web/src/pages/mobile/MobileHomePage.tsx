import { useNavigate } from 'react-router-dom';
import { useMobileHome, useStatuses } from '../../hooks/useApi';
import { useOfflineSync } from '../../lib/useOfflineSync';

export function MobileHomePage() {
  useOfflineSync();
  const { data: visits, isLoading } = useMobileHome();
  const { data: statuses } = useStatuses('VISIT');
  const navigate = useNavigate();

  const statusLabel = (id: string) => statuses?.find((s) => s.id === id)?.displayName ?? id;
  const statusColor = (id: string) => statuses?.find((s) => s.id === id)?.color ?? '#9ca3af';

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <header style={{ padding: '16px', background: '#fff', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0 }}>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>本日の訪問予定</h1>
      </header>

      <div style={{ padding: 12 }}>
        {isLoading && <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>読み込み中...</p>}
        {!isLoading && visits?.length === 0 && (
          <p style={{ textAlign: 'center', color: '#9ca3af', marginTop: 40 }}>本日の訪問予定はありません</p>
        )}

        {visits?.map((visit) => (
          <button
            key={visit.id}
            onClick={() => navigate(`/m/visits/${visit.id}`)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16,
              marginBottom: 10,
              fontSize: 15,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 700 }}>{new Date(visit.scheduledAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
              <span
                style={{
                  fontSize: 12,
                  color: '#fff',
                  background: statusColor(visit.statusId),
                  padding: '2px 8px',
                  borderRadius: 999,
                }}
              >
                {statusLabel(visit.statusId)}
              </span>
            </div>
            <div style={{ fontWeight: 600 }}>{visit.appointment.customer?.corporateName ?? '法人名未登録'}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{visit.appointment.visitAddress ?? visit.appointment.customer?.address ?? '住所未登録'}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
