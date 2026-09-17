import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { ReportAxis, ReportConfig, ReportDataSource, ReportMetric, ReportPreset, ReportRow } from '../../hooks/useApi';
import { ReportResultTable } from './ReportResultTable';

const DATA_SOURCE_OPTIONS: { id: ReportDataSource; label: string }[] = [
  { id: 'TOSS', label: 'トス' },
  { id: 'APPOINTMENT', label: 'アポ' },
  { id: 'VISIT', label: '訪問' },
  { id: 'CONTRACT', label: '成約' },
  { id: 'ENTRY', label: 'エントリー' },
];
const AXIS_OPTIONS: { id: ReportAxis; label: string }[] = [
  { id: 'USER', label: '担当者別' },
  { id: 'TEAM', label: 'チーム別' },
  { id: 'DEPARTMENT', label: '部署別' },
  { id: 'PRODUCT', label: '商材別' },
  { id: 'WEEK', label: '週次' },
  { id: 'MONTH', label: '月次' },
];
const METRIC_OPTIONS: { id: ReportMetric; label: string }[] = [
  { id: 'COUNT', label: '件数' },
  { id: 'CONVERSION_RATE', label: '転換率(1つ前の段階比。トス→アポ→訪問→成約→エントリー)' },
  { id: 'RANKING', label: 'ランキング(降順並び替え)' },
];
const PRESET_OPTIONS: { id: ReportPreset; label: string }[] = [
  { id: 'THIS_MONTH', label: '今月' },
  { id: 'LAST_MONTH', label: '先月' },
  { id: 'THIS_WEEK', label: '今週' },
  { id: 'LAST_WEEK', label: '先週' },
];

function todayInput(): string {
  const j = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`;
}

export function ReportBuilderModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [dataSource, setDataSource] = useState<ReportDataSource>('TOSS');
  const [axis, setAxis] = useState<ReportAxis>('USER');
  const [metrics, setMetrics] = useState<ReportMetric[]>(['COUNT']);
  const [periodMode, setPeriodMode] = useState<'PRESET' | 'CUSTOM'>('PRESET');
  const [preset, setPreset] = useState<ReportPreset>('THIS_MONTH');
  const [startDate, setStartDate] = useState(todayInput());
  const [endDate, setEndDate] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ReportRow[] | null>(null);

  const config: ReportConfig = useMemo(
    () => ({
      dataSource,
      axis,
      metrics,
      periodMode,
      ...(periodMode === 'PRESET' ? { preset } : { startDate, endDate }),
    }),
    [dataSource, axis, metrics, periodMode, preset, startDate, endDate],
  );

  const toggleMetric = (m: ReportMetric) =>
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  const previewMutation = useMutation({
    mutationFn: () => api.post<ReportRow[]>('/custom-reports/preview', { config }),
    onSuccess: (rows) => {
      setError(null);
      setPreview(rows);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'プレビューの取得に失敗しました'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/custom-reports', { name: name.trim(), config }),
    onSuccess: onSaved,
    onError: (e) => setError(e instanceof ApiError ? e.message : '保存に失敗しました'),
  });

  const canSave = name.trim() !== '' && metrics.length > 0;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: '95vw' }}>
        <div className="modal-head">
          <div className="modal-title">新しいレポートを作成</div>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
          {error && <p style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</p>}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
            レポート名
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 担当者別トス件数(今月)" style={{ padding: 6, fontSize: 13 }} />
          </label>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              対象データ
              <select value={dataSource} onChange={(e) => setDataSource(e.target.value as ReportDataSource)} style={{ fontSize: 13, padding: 5 }}>
                {DATA_SOURCE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              集計軸
              <select value={axis} onChange={(e) => setAxis(e.target.value as ReportAxis)} style={{ fontSize: 13, padding: 5 }}>
                {AXIS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>表示する指標</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {METRIC_OPTIONS.map((o) => (
                <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <input type="checkbox" checked={metrics.includes(o.id)} onChange={() => toggleMetric(o.id)} />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>期間</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="radio" checked={periodMode === 'PRESET'} onChange={() => setPeriodMode('PRESET')} />
                プリセット
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="radio" checked={periodMode === 'CUSTOM'} onChange={() => setPeriodMode('CUSTOM')} />
                期間を指定
              </label>
            </div>
            {periodMode === 'PRESET' ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESET_OPTIONS.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setPreset(o.id)}
                    style={{
                      fontSize: 12,
                      padding: '4px 12px',
                      border: 'none',
                      borderRadius: 999,
                      fontWeight: preset === o.id ? 700 : 500,
                      background: preset === o.id ? 'var(--color-primary-soft)' : 'var(--color-subtle)',
                      color: preset === o.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ fontSize: 13, padding: 5 }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>〜</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ fontSize: 13, padding: 5 }} />
              </div>
            )}
          </div>

          <div>
            <button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending} style={{ fontSize: 12 }}>
              {previewMutation.isPending ? '集計中...' : 'プレビュー'}
            </button>
          </div>

          {preview && <ReportResultTable config={config} rows={preview} reportName={name || 'preview'} />}
        </div>
        <div className="modal-foot">
          <button onClick={onClose} disabled={createMutation.isPending}>
            キャンセル
          </button>
          <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={!canSave || createMutation.isPending}>
            {createMutation.isPending ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
