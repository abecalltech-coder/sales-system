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
      injectManifest: {
        // ビルド後の総容量が既定の上限に近いため、通知用スクリプトを取り込むぶんだけ余裕を持たせる
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'CH partners実績管理',
        short_name: 'CH実績管理',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111827',
        icons: [],
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
