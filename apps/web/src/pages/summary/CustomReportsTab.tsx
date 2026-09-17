import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCustomReports, useCustomReport, useMe } from '../../hooks/useApi';
import { api, ApiError } from '../../lib/api';
import { PresenceBar } from '../../components/PresenceBar';
import { usePresence } from '../../lib/usePresence';
import { ReportBuilderModal } from './ReportBuilderModal';
import { ReportResultTable } from './ReportResultTable';

const DATA_SOURCE_LABEL: Record<string, string> = {
  TOSS: 'トス',
  APPOINTMENT: 'アポ',
  VISIT: '訪問',
  CONTRACT: '成約',
  ENTRY: 'エントリー',
};
const AXIS_LABEL: Record<string, string> = {
  USER: '担当者別',
  TEAM: 'チーム別',
  DEPARTMENT: '部署別',
  PRODUCT: '商材別',
  WEEK: '週次',
  MONTH: '月次',
};

/** サマリータブ「カスタムレポート作成」(要望)。セル単位の自由編集や数式は持たず、
 * 対象データ・集計軸・指標・期間を選んで名前を付けて保存し、あとで呼び出せる集計表。 */
export function CustomReportsTab() {
  const { data: reports, isLoading } = useCustomReports();
  const { data: me } = useMe();
  const presence = usePresence('SUMMARY', me?.id);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: selected, isLoading: selectedLoading } = useCustomReport(selectedId ?? undefined);

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: ['custom-reports'] });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/custom-reports/${id}`),
    onSuccess: (_data, id) => {
      invalidateList();
      if (selectedId === id) setSelectedId(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : '削除に失敗しました'),
  });

  return (
    <div>
      <PresenceBar viewers={presence.viewers} />

      {error && <p style={{ color: 'var(--color-danger)', fontSize: 12, marginBottom: 8 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 260, flexShrink: 0 }}>
          <button className="btn-primary" onClick={() => setBuilderOpen(true)} style={{ fontSize: 13, width: '100%', marginBottom: 10 }}>
            ＋ 新規レポート作成
          </button>
          {isLoading ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>読み込み中...</p>
          ) : (reports ?? []).length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>保存済みレポートはまだありません。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {reports!.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                    padding: '7px 10px',
                    borderRadius: 7,
                    cursor: 'pointer',
                    background: selectedId === r.id ? 'var(--color-primary-soft)' : 'var(--color-subtle)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: selectedId === r.id ? 'var(--color-primary)' : 'inherit',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.name}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--color-text-faint)' }}>
                      {DATA_SOURCE_LABEL[r.config.dataSource]} / {AXIS_LABEL[r.config.axis]}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`「${r.name}」を削除しますか?`)) deleteMutation.mutate(r.id);
                    }}
                    title="削除"
                    style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0, border: 'none', background: 'transparent', boxShadow: 'none', color: 'var(--color-text-faint)' }}
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedId ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>左の一覧からレポートを選ぶか、新規作成してください。</p>
          ) : selectedLoading || !selected ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-faint)' }}>読み込み中...</p>
          ) : (
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{selected.name}</h2>
              <p style={{ fontSize: 11.5, color: 'var(--color-text-faint)', marginBottom: 10 }}>
                {DATA_SOURCE_LABEL[selected.config.dataSource]} × {AXIS_LABEL[selected.config.axis]}
              </p>
              <ReportResultTable config={selected.config} rows={selected.rows} reportName={selected.name} />
            </div>
          )}
        </div>
      </div>

      {builderOpen && (
        <ReportBuilderModal
          onClose={() => setBuilderOpen(false)}
          onSaved={() => {
            setBuilderOpen(false);
            invalidateList();
          }}
        />
      )}
    </div>
  );
}
