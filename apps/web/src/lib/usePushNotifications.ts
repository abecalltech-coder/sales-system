import { useEffect, useState } from 'react';
import { api } from './api';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PermissionState = NotificationPermission | 'unsupported';

/** この端末で通知をOFFにしたか(OFFにした人には自動で登録し直さない) */
const OPT_OUT_KEY = 'push.optOut';
const optedOut = () => {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch {
    return false;
  }
};
const setOptOut = (v: boolean) => {
  try {
    if (v) localStorage.setItem(OPT_OUT_KEY, '1');
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // 保存できない端末では毎回登録し直すだけ
  }
};

/** 購読を作って(無ければ)サーバーへ登録する。サーバー側で消えていても登録し直せる(同じ端末は上書き) */
async function registerSubscription(): Promise<boolean> {
  const { publicKey } = await api.get<{ publicKey: string | null }>('/push/vapid-public-key');
  if (!publicKey) return false;
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
  return true;
}

let resynced = false;

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
    // 開くたびに(1回だけ)通知の登録をサーバーへ送り直す。長く開かない間に期限切れで消えた登録や、
    // ブラウザが入れ替えた登録でも、次に開いたときに通知が届くように戻す(要望: いつでも通知が来るように)
    if (!resynced && !optedOut() && 'PushManager' in window) {
      resynced = true;
      registerSubscription()
        .then((ok) => ok && setSubscribed(true))
        .catch(() => undefined);
    }
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

      if (!(await registerSubscription())) {
        setError('サーバー側の通知設定が未完了です');
        return;
      }
      setOptOut(false);
      setSubscribed(true);
    } catch {
      setError('通知の有効化に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  /** この端末の通知をOFFにする(購読を解除してサーバーからも削除) */
  const disable = async () => {
    if (!('serviceWorker' in navigator)) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.request('/push/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
        await sub.unsubscribe();
      }
      setOptOut(true);
      setSubscribed(false);
    } catch {
      setError('通知の停止に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return { permission, subscribed, busy, error, enable, disable };
}
