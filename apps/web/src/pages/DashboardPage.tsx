import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AppLayout } from '../components/AppLayout';
import { useKpiSummary, useMe } from '../hooks/useApi';

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value.toLocaleString()}</div>
    </div>
  );
}

export function DashboardPage() {
  const { data: me } = useMe();
  const { data: kpi, isLoading } = useKpiSummary();

  const funnelData = kpi
    ? [
        { name: 'トス', count: kpi.counts.tossCount },
        { name: 'アポ', count: kpi.counts.appointmentCount },
        { name: '訪問到着', count: kpi.counts.visitArrivedCount },
        { name: '商談', count: kpi.counts.meetingCount },
        { name: '成約', count: kpi.counts.contractCount },
        { name: 'エントリー', count: kpi.counts.entryCount },
      ]
    : [];

  return (
    <AppLayout>
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>ダッシュボード</h1>
        {me && <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>ようこそ、{me.name}さん</p>}

        {isLoading && <p>読み込み中...</p>}

        {kpi && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <KpiCard label="当月トス数" value={kpi.counts.tossCount} />
              <KpiCard label="当月アポ数" value={kpi.counts.appointmentCount} />
              <KpiCard label="当月訪問到着数" value={kpi.counts.visitArrivedCount} />
              <KpiCard label="当月商談数" value={kpi.counts.meetingCount} />
              <KpiCard label="当月成約数" value={kpi.counts.contractCount} />
              <KpiCard label="当月エントリー数" value={kpi.counts.entryCount} />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24, fontSize: 13 }}>
              <span>トス→アポ転換率: {kpi.conversionRates.tossToAppointment}%</span>
              <span>アポ→訪問転換率: {kpi.conversionRates.appointmentToVisit}%</span>
              <span>訪問→商談転換率: {kpi.conversionRates.visitToMeeting}%</span>
              <span>商談→成約転換率: {kpi.conversionRates.meetingToContract}%</span>
              <span>成約→エントリー転換率: {kpi.conversionRates.contractToEntry}%</span>
            </div>

            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
