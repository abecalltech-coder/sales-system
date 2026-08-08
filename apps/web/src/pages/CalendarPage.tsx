import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { api } from '../lib/api';

interface AppointmentItem {
  id: string;
  storeName: string | null;
  meetingStartAt: string | null;
  meetingType: string;
}

export function CalendarPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['appointments', 'calendar'],
    queryFn: () => api.get<{ items: AppointmentItem[] }>('/appointments?page=1&pageSize=50'),
  });

  const grouped = new Map<string, AppointmentItem[]>();
  for (const item of data?.items ?? []) {
    if (!item.meetingStartAt) continue;
    const day = new Date(item.meetingStartAt).toLocaleDateString('ja-JP');
    grouped.set(day, [...(grouped.get(day) ?? []), item]);
  }

  return (
    <AppLayout>
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>カレンダー</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          Googleカレンダー連携が未設定のため、システム内のアポ予定を日付順のリスト表示しています。
          Google連携設定後は、実際のカレンダーグリッド表示・Google Meet URL表示に対応する予定です。
        </p>

        {isLoading && <p>読み込み中...</p>}

        {[...grouped.entries()].map(([day, items]) => (
          <div key={day} style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{day}</div>
            {items.map((item) => (
              <div key={item.id} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                {new Date(item.meetingStartAt!).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} — {item.storeName ?? '(店舗名未設定)'}({item.meetingType})
              </div>
            ))}
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
