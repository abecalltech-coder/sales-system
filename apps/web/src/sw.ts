/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// vite-plugin-pwa(injectManifest方式)がビルド時にプリキャッシュ対象ファイル一覧を注入する
precacheAndRoute(self.__WB_MANIFEST);

// injectManifest方式ではskipWaiting/clientsClaimが自動注入されないため明示する。
// これがないと新しいSWが「待機中」のまま有効化されず、デプロイしても全タブを
// 完全に閉じるまで古い画面が表示され続ける(要望のUI変更が反映されない原因)。
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
// registerType:'autoUpdate' が新SW検出時に送ってくるメッセージにも対応する
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

// CLカレンダーのリマインド・実施報告通知(セクション追加要望)を表示する
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: PushPayload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url ?? '/' },
    }),
  );
});

// 通知クリックで該当画面(CLカレンダー等)を開く/前面化する
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c);
      if (existing) {
        existing.focus();
        if ('navigate' in existing) (existing as WindowClient).navigate(url);
        return;
      }
      return self.clients.openWindow(url);
    }),
  );
});
