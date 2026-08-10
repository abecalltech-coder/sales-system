import { useEffect, useState } from 'react';
import { api } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PermissionState = NotificationPermission | 'unsupported';

/**
 * CLカレンダーのリマインド・実施報告のデスクトップ/スマホ通知(Web Push)を
 * 有効化するためのフック(セクション追加要望)。PWAとしてインストールされた
 * 状態であればスマホでも同じ仕組みで通知を受け取れる。
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<PermissionState>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (permission !== 'granted' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => undefined);
  }, [permission]);

  const enable = async () => {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('この端末・ブラウザはプッシュ通知に対応していません');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError('通知が許可されませんでした');
        return;
      }

      const { publicKey } = await api.get<{ publicKey: string | null }>('/push/vapid-public-key');
      if (!publicKey) {
        setError('サーバー側の通知設定が未完了です');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
      }
      const json = sub.toJSON();
      await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
      setSubscribed(true);
    } catch {
      setError('通知の有効化に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return { permission, subscribed, busy, error, enable };
}
