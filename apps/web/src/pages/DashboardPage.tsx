import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AppLayout } from '../components/AppLayout';
import { useKpiSummary, useMe } from '../hooks/useApi';

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ minWidth: 140, flex: '1 1 140px', padding: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{value.toLocaleString()}</div>
    </div>
  );
}

function RateChip({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 12,
      }}
    >
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{value}%</span>
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
      ]
    : [];

  return (
    <AppLayout>
      <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>ダッシュボード</h1>
        {me && <p style={{ color: 'var(--color-text-muted)', fontSize: 13, marginBottom: 24 }}>ようこそ、{me.name}さん</p>}

        {isLoading && <p style={{ color: 'var(--color-text-faint)' }}>読み込み中...</p>}

        {kpi && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <KpiCard label="当月トス数" value={kpi.counts.tossCount} />
              <KpiCard label="当月アポ数" value={kpi.counts.appointmentCount} />
              <KpiCard label="当月訪問到着数" value={kpi.counts.visitArrivedCount} />
              <KpiCard label="当月商談数" value={kpi.counts.meetingCount} />
              <KpiCard label="当月成約数" value={kpi.counts.contractCount} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
              <RateChip label="トス→アポ" value={kpi.conversionRates.tossToAppointment} />
              <RateChip label="アポ→訪問" value={kpi.conversionRates.appointmentToVisit} />
              <RateChip label="訪問→商談" value={kpi.conversionRates.visitToMeeting} />
              <RateChip label="商談→成約" value={kpi.conversionRates.meetingToContract} />
            </div>

            <div className="card" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <CartesianGrid stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
                  <YAxis fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: 8, borderColor: '#e5e7eb', fontSize: 13 }} />
                  <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
