import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '../components/AppLayout';
import { InlineNumber, InlineText } from '../components/InlineEdit';
import { MonthSwitcher } from '../components/MonthSwitcher';
import { usePeriodMonth } from '../lib/usePeriodMonth';
import { useFinalReportMonth, useMe, FinalReportField } from '../hooks/useApi';
import { api, ApiError } from '../lib/api';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function todayKeyJst(): string {
  const j = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`;
}
function dowOf(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** computed 式("callSf+callBlank")を評価。参照は code。数値化できないものは 0。 */
function evalComputed(expr: string, get: (code: string) => number): number | null {
  const parts = expr.split('+').map((s) => s.trim());
  if (parts.some((p) => !/^[a-zA-Z0-9_]+$/.test(p))) return null;
  return parts.reduce((a, code) => a + get(code), 0);
}

export function FinalReportPage() {
  const [periodMonth] = usePeriodMonth();
  const { data: me } = useMe();
  const { data, isLoading } = useFinalReportMonth(periodMonth);
  const queryClient = useQueryClient();

  const upsert = useMutation({
    mutationFn: (v: { date: string; fieldId: string; value: number | string | null }) =>
      api.post('/final-reports/entries', { date: v.date, valuesPatch: { [v.fieldId]: v.value } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['final-report-month'] }),
    onError: (e) => alert(e instanceof ApiError ? e.message : '保存に失敗しました'),
  });

  const days = data?.days ?? [];
  const fields = data?.fields ?? [];
  const entries = data?.entries ?? {};
  const today = todayKeyJst();

  const fieldById = useMemo(() => {
    const m = new Map<string, FinalReportField>();
    for (const f of fields) m.set(f.id, f);
    return m;
  }, [fields]);
  const idByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fields) if (f.code) m.set(f.code, f.id);
    return m;
  }, [fields]);

  const rawValue = (date: string, fieldId: string) => entries[date]?.[fieldId];
  const numValue = (date: string, fieldId: string) => {
    const v = rawValue(date, fieldId);
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const computedValue = (date: string, f: FinalReportField): number | null =>
    f.computed ? evalComputed(f.computed, (code) => numValue(date, idByCode.get(code) ?? '')) : null;

  const todayInMonth = days.includes(today);
  const todayReported = todayInMonth && Object.keys(entries[today] ?? {}).length > 0;

  const cellW = 46;
  const labelW = 150;

  const th: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    background: 'var(--color-subtle)',
    borderBottom: '1px solid var(--color-border-strong)',
    borderRight: '1px solid var(--color-border)',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 0',
    textAlign: 'center',
    zIndex: 2,
  };
  const labelCell: React.CSSProperties = {
    position: 'sticky',
    left: 0,
    background: 'var(--color-surface)',
    borderRight: '1px solid var(--color-border-strong)',
    borderBottom: '1px solid var(--color-border)',
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 8px',
    whiteSpace: 'nowrap',
    zIndex: 1,
  };
  const dataCell: React.CSSProperties = {
    borderRight: '1px solid var(--color-border)',
    borderBottom: '1px solid var(--color-border)',
    padding: 0,
    height: 24,
  };

  return (
    <AppLayout>
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="page-title">最終報告</h1>
            <MonthSwitcher />
          </div>
          {todayInMonth && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: 999,
                background: todayReported ? 'var(--color-success-soft)' : 'var(--color-danger-soft)',
                color: todayReported ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              {todayReported ? `本日 ${today.slice(5).replace('-', '/')} 入力済み` : `本日 ${today.slice(5).replace('-', '/')} 未入力`}
            </span>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          日々の数値を入力してください。19:00時点で出勤日にもかかわらず未入力の場合、責任者・管理者へ通知されます。
        </p>

        {isLoading ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
        ) : (
          <div
            style={{
              overflow: 'auto',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              maxHeight: 'calc(100vh - 170px)',
              background: 'var(--color-surface)',
            }}
          >
            <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ ...th, ...labelCell, left: 0, top: 0, zIndex: 3, minWidth: labelW, textAlign: 'left' }}>項目</th>
                  {days.map((d) => {
                    const dow = dowOf(d);
                    const weekend = dow === 0 || dow === 6;
                    return (
                      <th key={d} style={{ ...th, minWidth: cellW, width: cellW, background: d === today ? 'var(--color-primary-soft)' : th.background }}>
                        <div>{d.slice(5).replace('-', '/').replace(/^0/, '')}</div>
                        <div style={{ fontSize: 9, color: weekend ? 'var(--color-danger)' : 'var(--color-text-faint)' }}>{WEEKDAYS[dow]}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* 1行目: ユーザー名(自動) */}
                <tr>
                  <td style={{ ...labelCell, background: 'var(--color-subtle)', fontWeight: 700 }}>
                    {data?.userName ?? me?.name ?? '—'}
                  </td>
                  {days.map((d) => (
                    <td key={d} style={{ ...dataCell, background: d === today ? 'rgba(52,83,209,0.05)' : 'var(--color-subtle)' }} />
                  ))}
                </tr>

                {fields.map((f) => (
                  <tr key={f.id}>
                    <td style={labelCell} title={f.computed ? '自動計算' : undefined}>
                      {f.label}
                      {f.unit ? <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}> ({f.unit})</span> : null}
                    </td>
                    {days.map((d) => {
                      const isToday = d === today;
                      const bg = isToday ? 'rgba(52,83,209,0.05)' : undefined;
                      if (f.computed) {
                        const v = computedValue(d, f);
                        return (
                          <td key={d} style={{ ...dataCell, background: bg }}>
                            <span style={{ display: 'block', textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)' }}>
                              {v == null || v === 0 ? '' : v.toLocaleString('ja-JP')}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={d} style={{ ...dataCell, background: bg }}>
                          {f.fieldType === 'TEXT' ? (
                            <InlineText
                              value={rawValue(d, f.id) == null ? '' : String(rawValue(d, f.id))}
                              onSave={(x) => upsert.mutate({ date: d, fieldId: f.id, value: x || null })}
                            />
                          ) : (
                            <InlineNumber
                              value={typeof rawValue(d, f.id) === 'number' ? (rawValue(d, f.id) as number) : rawValue(d, f.id) != null ? Number(rawValue(d, f.id)) : null}
                              align="center"
                              onSave={(n) => upsert.mutate({ date: d, fieldId: f.id, value: n })}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
