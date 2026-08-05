import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMobileVisit, useStatuses } from '../../hooks/useApi';
import { api } from '../../lib/api';
import { getCurrentLocation } from '../../lib/geolocation';
import { enqueueAction } from '../../lib/offlineQueue';

const MEETING_RESULTS = ['成約', '見込み', '再商談', '再訪問', '保留', '失注', '不在', 'キャンセル', '対象外'];

function BottomButton({ onClick, children, disabled, primary }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '16px 8px',
        fontSize: 15,
        fontWeight: 700,
        border: 'none',
        background: primary ? '#16a34a' : '#e5e7eb',
        color: primary ? '#fff' : '#111827',
      }}
    >
      {children}
    </button>
  );
}

export function MobileVisitDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: visit, isLoading } = useMobileVisit(id);
  const { data: statuses } = useStatuses('VISIT');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [showResultForm, setShowResultForm] = useState(false);
  const [meetingResult, setMeetingResult] = useState('成約');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['visits', id] });
    queryClient.invalidateQueries({ queryKey: ['mobile', 'home'] });
  };

  const arriveMutation = useMutation({
    mutationFn: async () => {
      const geo = await getCurrentLocation();
      const payload = {
        latitude: geo.latitude,
        longitude: geo.longitude,
        accuracy: geo.accuracy,
        locationPermissionStatus: geo.locationPermissionStatus,
      };
      try {
        return await api.post(`/visits/${id}/arrive`, payload);
      } catch (err) {
        // 通信断時は端末内へ一時保存し、あとで再送する(セクション24)
        enqueueAction({
          idempotencyKey: crypto.randomUUID(),
          actionType: 'ARRIVE',
          targetEntityId: id,
          payload,
          capturedAt: new Date().toISOString(),
        });
        setSyncMessage('オフラインのため、通信復旧後に自動で反映されます');
        throw err;
      }
    },
    onSuccess: invalidate,
  });

  const startMeetingMutation = useMutation({
    mutationFn: async (alsoRegisterArrival: boolean) => {
      const geo = await getCurrentLocation();
      const payload = { latitude: geo.latitude, longitude: geo.longitude, alsoRegisterArrival };
      try {
        return await api.post(`/visits/${id}/start-meeting`, payload);
      } catch (err) {
        enqueueAction({
          idempotencyKey: crypto.randomUUID(),
          actionType: 'START_MEETING',
          targetEntityId: id,
          payload,
          capturedAt: new Date().toISOString(),
        });
        setSyncMessage('オフラインのため、通信復旧後に自動で反映されます');
        throw err;
      }
    },
    onSuccess: invalidate,
  });

  const endMeetingMutation = useMutation({
    mutationFn: async () => {
      const payload = { meetingResult };
      try {
        return await api.post(`/visits/${id}/end-meeting`, payload);
      } catch (err) {
        enqueueAction({
          idempotencyKey: crypto.randomUUID(),
          actionType: 'END_MEETING',
          targetEntityId: id,
          payload,
          capturedAt: new Date().toISOString(),
        });
        setSyncMessage('オフラインのため、通信復旧後に自動で反映されます');
        throw err;
      }
    },
    onSuccess: () => {
      setShowResultForm(false);
      invalidate();
    },
  });

  if (isLoading || !visit) {
    return <div style={{ padding: 24, textAlign: 'center' }}>読み込み中...</div>;
  }

  const statusInternalCode = statuses?.find((s) => s.id === visit.statusId)?.internalCode;
  const customer = visit.appointment.customer;
  const phone = customer?.phone;
  const address = visit.appointment.visitAddress ?? customer?.address;
  const mapUrl = address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : undefined;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={() => navigate('/m')} style={{ fontSize: 13, marginBottom: 8 }}>
          ← 戻る
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 700 }}>{customer?.corporateName ?? '法人名未登録'}</h1>
        <p style={{ fontSize: 13, color: '#6b7280' }}>{customer?.contactName}</p>
      </header>

      <div style={{ flex: 1, padding: 16 }}>
        {syncMessage && <p style={{ background: '#fef3c7', padding: 8, borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{syncMessage}</p>}

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>訪問予定時刻</div>
          <div style={{ fontSize: 16 }}>{new Date(visit.scheduledAt).toLocaleString('ja-JP')}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>訪問先住所</div>
          <div style={{ fontSize: 16 }}>{address ?? '未登録'}</div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>電話番号</div>
          <div style={{ fontSize: 16 }}>{phone ?? '未登録'}</div>
        </div>

        {showResultForm && (
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>商談結果</div>
            <select value={meetingResult} onChange={(e) => setMeetingResult(e.target.value)} style={{ width: '100%', padding: 10, fontSize: 15, marginBottom: 12 }}>
              {MEETING_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              onClick={() => endMeetingMutation.mutate()}
              style={{ width: '100%', padding: 14, fontSize: 15, fontWeight: 700, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8 }}
            >
              結果を登録する
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', position: 'sticky', bottom: 0, borderTop: '1px solid #e5e7eb' }}>
        {phone && (
          <BottomButton onClick={() => (window.location.href = `tel:${phone}`)}>📞 電話</BottomButton>
        )}
        {mapUrl && (
          <BottomButton onClick={() => window.open(mapUrl, '_blank')}>🗺 地図</BottomButton>
        )}

        {statusInternalCode !== 'VISIT_ARRIVED' && statusInternalCode !== 'MEETING_IN_PROGRESS' && statusInternalCode !== 'MEETING_COMPLETED' && (
          <BottomButton primary onClick={() => arriveMutation.mutate()} disabled={arriveMutation.isPending}>
            訪問到着
          </BottomButton>
        )}
        {statusInternalCode === 'VISIT_ARRIVED' && (
          <BottomButton primary onClick={() => startMeetingMutation.mutate(false)} disabled={startMeetingMutation.isPending}>
            商談開始
          </BottomButton>
        )}
        {statusInternalCode === 'MEETING_IN_PROGRESS' && (
          <BottomButton primary onClick={() => setShowResultForm(true)}>
            商談終了
          </BottomButton>
        )}
      </div>
    </div>
  );
}
