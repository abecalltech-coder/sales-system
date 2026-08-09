import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePendingReports, REPORT_CHECKPOINTS } from '../hooks/useApi';
import { api } from '../lib/api';

/**
 * 部署責任者(MANAGER)向けの実施報告確認通知(セクション追加要望)。
 * 確認完了を押すまで一覧に残り続ける。
 */
export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const { data: pending } = usePendingReports();
  const queryClient = useQueryClient();

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointment-reports/${id}/acknowledge`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointment-reports'] }),
  });

  const count = pending?.length ?? 0;
  const checkpointLabel = (id: string) => REPORT_CHECKPOINTS.find((c) => c.id === id)?.label ?? id;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="実施報告の確認通知"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 8,
          padding: collapsed ? '8px 0' : '8px 10px',
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <span style={{ position: 'relative', fontSize: 15 }}>
          🔔
          {count > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -6,
                background: 'var(--color-danger)',
                color: '#fff',
                borderRadius: 999,
                fontSize: 9,
                fontWeight: 700,
                minWidth: 14,
                height: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 2px',
              }}
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        {!collapsed && <span>通知{count > 0 ? `(${count})` : ''}</span>}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: collapsed ? 0 : 0,
            marginBottom: 6,
            width: 320,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 500,
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)', fontSize: 13, fontWeight: 700 }}>
            実施報告の確認({count}件)
          </div>
          {count === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-faint)' }}>未確認の報告はありません</div>
          ) : (
            pending?.map((r) => (
              <div key={r.id} style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 11, color: 'var(--color-text-faint)', marginBottom: 2 }}>
                  {r.appointment.customer?.corporateName ?? r.appointment.caseNumber} ・ {checkpointLabel(r.checkpoint)}
                </div>
                <div style={{ fontSize: 12, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{r.reportText}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>
                    {new Date(r.reportedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    disabled={ackMutation.isPending}
                    onClick={() => ackMutation.mutate(r.id)}
                  >
                    確認完了
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
