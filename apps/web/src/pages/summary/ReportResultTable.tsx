import { ReportConfig, ReportRow } from '../../hooks/useApi';

const AXIS_LABEL: Record<ReportConfig['axis'], string> = {
  USER: '担当者',
  TEAM: 'チーム',
  DEPARTMENT: '部署',
  PRODUCT: '商材',
  WEEK: '週',
  MONTH: '月',
};

function csvEscape(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 集計結果の表(件数・転換率・順位)。CSV出力もここで行う。 */
export function ReportResultTable({ config, rows, reportName }: { config: ReportConfig; rows: ReportRow[]; reportName: string }) {
  const showRank = config.metrics.includes('RANKING');
  const showCount = config.metrics.includes('COUNT');
  const showRate = config.metrics.includes('CONVERSION_RATE');

  const exportCsv = () => {
    const header = [
      ...(showRank ? ['順位'] : []),
      AXIS_LABEL[config.axis],
      ...(showCount ? ['件数'] : []),
      ...(showRate ? ['転換率'] : []),
    ];
    const body = rows.map((r) => [
      ...(showRank ? [String(r.rank ?? '')] : []),
      r.axisLabel,
      ...(showCount ? [String(r.count)] : []),
      ...(showRate ? [r.conversionRate == null ? '' : `${(r.conversionRate * 100).toFixed(1)}%`] : []),
    ]);
    downloadCsv(`${reportName || 'report'}.csv`, [header, ...body]);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button onClick={exportCsv} disabled={rows.length === 0} style={{ fontSize: 12 }}>
          CSV出力
        </button>
      </div>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>該当するデータがありません。</p>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-subtle)' }}>
                {showRank && <th style={th}>順位</th>}
                <th style={{ ...th, textAlign: 'left' }}>{AXIS_LABEL[config.axis]}</th>
                {showCount && <th style={th}>件数</th>}
                {showRate && <th style={th}>転換率</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.axisKey} style={{ borderTop: '1px solid var(--color-border)' }}>
                  {showRank && <td style={td}>{r.rank}</td>}
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{r.axisLabel}</td>
                  {showCount && <td style={td}>{r.count.toLocaleString('ja-JP')}</td>}
                  {showRate && <td style={td}>{r.conversionRate == null ? '–' : `${(r.conversionRate * 100).toFixed(1)}%`}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: '7px 12px', textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' };
const td: React.CSSProperties = { padding: '6px 12px', textAlign: 'center' };
