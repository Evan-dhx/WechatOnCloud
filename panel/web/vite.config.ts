import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 开发时把 /api 与 /desktop 代理到本地后端（npm run dev 时用）
const BACKEND = process.env.BACKEND || 'http://localhost:8080';

export default defineConfig({
  base: '/woc/', // 嵌入主项目 /woc/ 路径下，资源路径带 /woc/ 前缀
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-180.png'],
      manifest: {
        name: '即時通訊',
        short_name: '即時通訊',
        description: 'NetCraft 運營中心',
        lang: 'zh-CN',
        theme_color: '#07C160',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/woc/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 桌面反代与 API 不能被 SW 拦截
        navigateFallbackDenylist: [/^\/desktop/, /^\/api/, /^\/woc/],
        // 新版本立即接管 + 清理旧缓存，避免更新后仍跑旧代码（硬刷新绕不过 SW）
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': BACKEND,
      '/desktop': { target: BACKEND, ws: true },
    },
  },
  build: { outDir: 'dist' },
});
