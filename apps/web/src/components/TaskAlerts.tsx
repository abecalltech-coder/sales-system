import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { IMPORTANCE, fmtDue, useTaskAlerts } from '../lib/tasks';

/**
 * タスクの通知(アプリ内)。要望: 消えないようにし、対応完了・編集・5分後再通知 のいずれかを押すまで出し続ける。
 * (端末の通知とは別。アプリを開いていればこちらが必ず出る)
 */
export function TaskAlerts() {
  const { data: alerts } = useTaskAlerts();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const act = useMutation({
    mutationFn: (v: { id: string; action: 'complete' | 'snooze' }) => api.post(`/tasks/${v.id}/${v.action}`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  if (!alerts || alerts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        right: 10,
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        zIndex: 2400,
        width: 'min(340px, calc(100vw - 20px))',
        maxHeight: '60vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {alerts.map((a) => {
        const imp = IMPORTANCE[a.importance] ?? IMPORTANCE[3];
        return (
          <div key={a.id} className="popover" style={{ padding: '10px 12px', borderTop: `4px solid ${imp.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, background: imp.color, color: imp.text }}>{imp.label}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>タスクの期日 {fmtDue(a.occurrence)}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 2 }}>{a.title}</div>
            {a.detail && <div style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>{a.detail}</div>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button type="button" className="btn-primary" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: 'complete' })} style={{ fontSize: 12, padding: '4px 10px' }}>
                対応完了
              </button>
              <button
                type="button"
                onClick={() => {
                  // 編集中は5分間通知を止め、編集画面を開く(期日を変えれば通知もやり直しになる)
                  act.mutate({ id: a.id, action: 'snooze' });
                  navigate(`/tasks?edit=${a.id}`);
                }}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                編集
              </button>
              <button type="button" disabled={act.isPending} onClick={() => act.mutate({ id: a.id, action: 'snooze' })} style={{ fontSize: 12, padding: '4px 10px' }}>
                5分後再通知
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
