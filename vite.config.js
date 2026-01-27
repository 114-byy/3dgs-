// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [
    vue(),              // 必须！启用 Vue SFC 支持
    tsconfigPaths()     // 支持 tsconfig 路径别名
  ],
  resolve: {
    alias: {
      '@': '/src'       // 可选：设置 @ 指向 src
    }
  },
  build: {
    outDir: 'dist',     // 明确输出目录
    sourcemap: true,
    rollupOptions: {
      input: '/index.html' // 明确入口 HTML
    }
  },
  server: {
    port: 5173,
    open: true
  }
});