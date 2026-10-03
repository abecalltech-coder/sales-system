import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePendingReports, REPORT_CHECKPOINTS } from '../hooks/useApi';
import { usePushNotifications } from '../lib/usePushNotifications';
import { api } from '../lib/api';

/**
 * 「通知」1つにまとめたメニュー(要望: ベルが2つあったのを1つに、絵文字はやめる)。
 * この端末の通知(Web Push)がOFFのときは「通知」に横線を引く。
 * 押すと、通知のON/OFF・テスト送信と、部署責任者以上なら実施報告の確認一覧を出す。
 *
 * variant: sidebar = PCの左メニュー / tab = 携帯の下メニューの1タブ
 */
export function NotificationMenu({
  variant,
  collapsed = false,
  showReports,
}: {
  variant: 'sidebar' | 'tab';
  collapsed?: boolean;
  showReports: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const push = usePushNotifications();
  const on = push.permission === 'granted' && push.subscribed;
  const { data: pending } = usePendingReports({ enabled: showReports });
  const count = showReports ? (pending?.length ?? 0) : 0;
  const queryClient = useQueryClient();
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const ackMutation = useMutation({
    mutationFn: (id: string) => api.post(`/appointment-reports/${id}/acknowledge`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointment-reports'] }),
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const sendTest = async () => {
    setTestMsg(null);
    try {
      const res = await api.post<{ ok: boolean; reason?: string }>('/push/test');
      setTestMsg(res.ok ? '送信しました。数秒以内に通知が出ます' : (res.reason ?? '送信できませんでした'));
    } catch {
      setTestMsg('送信に失敗しました');
    }
  };

  const checkpointLabel = (id: string) => REPORT_CHECKPOINTS.find((c) => c.id === id)?.label ?? id;
  const label = '通知';
  const strike = !on ? { textDecoration: 'line-through', textDecorationThickness: 2 } : {};
  const statusTitle = on ? 'この端末の通知: ON' : 'この端末の通知: OFF';

  const icon = (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <svg width={variant === 'tab' ? 19 : 16} height={variant === 'tab' ? 19 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10 21h4" />
        {!on && <path d="M3 3l18 18" />}
      </svg>
      {count > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -5,
            right: -8,
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
  );

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {variant === 'tab' ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={statusTitle}
          style={{
            minWidth: 52,
            height: 52,
            padding: '7px 4px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            color: on ? 'var(--color-text-muted)' : 'var(--color-text-faint)',
          }}
        >
          {icon}
          <span style={{ fontSize: 9.5, fontWeight: 700, ...strike }}>{label}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title={statusTitle}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 9,
            padding: collapsed ? '7px 0' : '6px 9px',
            borderRadius: 7,
            border: 'none',
            background: 'transparent',
            boxShadow: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: on ? 'var(--color-text-muted)' : 'var(--color-text-faint)',
          }}
        >
          {icon}
          {!collapsed && <span style={strike}>{label}</span>}
        </button>
      )}

      {open && (
        <div
          className="popover"
          style={{
            position: variant === 'tab' ? 'fixed' : 'absolute',
            ...(variant === 'tab' ? { right: 8, bottom: 'calc(70px + env(safe-area-inset-bottom))' } : { bottom: '100%', left: 0, marginBottom: 6 }),
            width: 'min(320px, calc(100vw - 16px))',
            maxHeight: 440,
            overflowY: 'auto',
            zIndex: 500,
          }}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12 }}>この端末の通知(商談リマインド・実施報告)</span>
              {push.permission === 'unsupported' ? (
                <span style={{ fontSize: 11, color: 'var(--color-text-faint)' }}>非対応</span>
              ) : (
                <button
                  type="button"
                  disabled={push.busy}
                  onClick={() => (on ? push.disable() : push.enable())}
                  style={{
                    fontSize: 11,
                    padding: '3px 10px',
                    background: on ? 'var(--color-primary)' : 'var(--color-surface)',
                    color: on ? '#fff' : 'var(--color-text)',
                  }}
                >
                  {push.busy ? '設定中...' : on ? 'ON' : 'OFF'}
                </button>
              )}
            </div>
            {push.error && <p style={{ fontSize: 11, color: 'var(--color-danger)', margin: '4px 0 0' }}>{push.error}</p>}
            {on && (
              <div style={{ marginTop: 6 }}>
                <button type="button" onClick={sendTest} style={{ fontSize: 10, padding: '2px 6px' }}>
                  テスト通知を送る
                </button>
                {testMsg && <p style={{ fontSize: 10, color: 'var(--color-text-muted)', margin: '4px 0 0' }}>{testMsg}</p>}
              </div>
            )}
          </div>

          {showReports && (
            <>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>実施報告の確認({count}件)</div>
              {count === 0 ? (
                <div style={{ padding: 14, fontSize: 12, color: 'var(--color-text-faint)' }}>未確認の報告はありません</div>
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
                      <button style={{ fontSize: 11, padding: '3px 8px' }} disabled={ackMutation.isPending} onClick={() => ackMutation.mutate(r.id)}>
                        確認完了
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
