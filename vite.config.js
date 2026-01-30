// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // 关键修复：添加 base 配置
  base: '/3dgs-/',
  
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
    assetsDir: 'assets', // 添加 assets 目录配置，避免路径问题
    
    // 合并 rollupOptions
    rollupOptions: {
      input: '/index.html', // 明确入口 HTML
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  },
  
  server: {
    port: 5173,
    open: true
  }
});