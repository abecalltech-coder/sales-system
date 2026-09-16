import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // 既定の自動注入スクリプトは navigator.serviceWorker.register() を呼ぶだけで、
      // 更新チェックの定期実行も新SW適用後の自動リロードも行わない(=スマホでホーム画面に
      // 追加したアプリが古いまま反映されない原因)。src/pwaRegister.ts から
      // virtual:pwa-register を使って自前で登録するため、自動注入は無効化する。
      injectRegister: false,
      injectManifest: {
        // ビルド後の総容量が既定の上限に近いため、通知用スクリプトを取り込むぶんだけ余裕を持たせる
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'CH partners実績管理',
        short_name: 'CH実績管理',
        start_url: '/',
        display: 'standalone',
        background_color: '#eef0f4',
        theme_color: '#3453d1',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', changeOrigin: true, ws: true },
    },
  },
});
