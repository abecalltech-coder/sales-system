import { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { MonthlySummaryTab } from './summary/MonthlySummaryTab';
import { ShiftTab } from './summary/ShiftTab';
import { FreeSheetTab } from './summary/FreeSheetTab';

type Tab = 'summary' | 'shift' | 'free';

const TABS: { id: Tab; label: string }[] = [
  { id: 'summary', label: '実績' },
  { id: 'shift', label: 'シフト' },
  { id: 'free', label: 'フリーシート' },
];

export function SummarySheetsPage() {
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <AppLayout>
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
          <h1 className="page-title">サマリー</h1>
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-border)', flex: 1 }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '7px 16px',
                  fontSize: 13,
                  border: 'none',
                  boxShadow: 'none',
                  background: 'transparent',
                  borderBottom: tab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                  fontWeight: tab === t.id ? 700 : 500,
                  color: tab === t.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'summary' && <MonthlySummaryTab />}
        {tab === 'shift' && <ShiftTab />}
        {tab === 'free' && <FreeSheetTab />}
      </div>
    </AppLayout>
  );
}
