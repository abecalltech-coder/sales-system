import { registerSW } from 'virtual:pwa-register';

/**
 * Service Workerを登録し、新バージョンを自動的に反映する。
 * vite-pluginの既定の自動注入スクリプトは register() を呼ぶだけで更新チェックを
 * 定期実行しないため、スマホでホーム画面に追加したアプリを開いたままだと
 * デプロイした変更がいつまでも反映されない(要望の原因)。ここでは
 * - 1分おきに新バージョンの有無をチェック
 * - 新SWが有効化されたら自動でページをリロード
 * を行い、開きっぱなしでも次にアプリを開き直せば必ず最新化されるようにする。
 */
export function registerPwa() {
  if (!('serviceWorker' in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    },
    onNeedRefresh() {
      updateSW(true);
    },
  });
}
