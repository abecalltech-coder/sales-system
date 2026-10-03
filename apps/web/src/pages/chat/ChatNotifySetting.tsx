import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

type Mode = 'ALL' | 'MENTION' | 'OFF';
const MODES: { value: Mode; label: string; help: string }[] = [
  { value: 'ALL', label: 'すべて', help: '新しいメッセージをすべて通知' },
  { value: 'MENTION', label: 'メンションのみ', help: '自分宛て・全員宛てのメンションだけ通知' },
  { value: 'OFF', label: 'オフ', help: 'このグループは通知しない' },
];

/** この端末のWeb Push購読(=端末の識別)。通知がOFFの端末では null */
async function currentEndpoint(): Promise<string | null> {
  if (!('serviceWorker' in navigator) || typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * グループごとの通知設定(要望: 各人が自分で、その端末だけの設定として選ぶ)。
 * 端末の通知そのもの(ON/OFF)は右上のアカウントアイコンから。
 */
export function ChatNotifySetting({ roomId }: { roomId: string }) {
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);
  const [mode, setMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    currentEndpoint().then(async (ep) => {
      if (!alive) return;
      setEndpoint(ep);
      if (!ep) return;
      try {
        const res = await api.get<{ mode: Mode }>(`/chat/rooms/${roomId}/notify?endpoint=${encodeURIComponent(ep)}`);
        if (alive) setMode(res.mode);
      } catch {
        if (alive) setMode('ALL');
      }
    });
    return () => {
      alive = false;
    };
  }, [roomId]);

  const change = async (next: Mode) => {
    if (!endpoint) return;
    const prev = mode;
    setMode(next);
    setSaving(true);
    setError(null);
    try {
      await api.put(`/chat/rooms/${roomId}/notify`, { endpoint, mode: next });
    } catch (err) {
      setMode(prev);
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
      <div style={{ fontSize: 12, marginBottom: 6 }}>このグループの通知(この端末だけの設定)</div>
      {endpoint === undefined ? (
        <p style={{ fontSize: 11, color: 'var(--color-text-faint)', margin: 0 }}>確認中...</p>
      ) : endpoint === null ? (
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>この端末の通知がOFFです。右上のアカウントアイコンから通知をONにすると設定できます。</p>
      ) : (
        <div role="radiogroup" aria-label="このグループの通知" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 4 }}>
          {MODES.map((m) => {
            const on = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={saving || mode === null}
                title={m.help}
                onClick={() => void change(m.value)}
                style={{
                  fontSize: 12,
                  padding: '6px 4px',
                  background: on ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: on ? '#fff' : 'var(--color-text)',
                  borderColor: on ? 'var(--color-primary)' : undefined,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
      {error && <p style={{ fontSize: 11, color: 'var(--color-danger)', margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}
