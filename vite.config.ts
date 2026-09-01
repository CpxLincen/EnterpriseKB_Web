import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 前端开发服务器默认端口 5173；生产构建产物在 dist/ 下。
// 前后端分离：前端通过 VITE_API_BASE（默认 http://127.0.0.1:8000）调用后端 API。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    // 本地开发：把 API 请求代理到后端（与生产环境 Nginx 反代保持一致）
    proxy: {
      '/knowledge-bases': 'http://127.0.0.1:8000',
      '/chat': 'http://127.0.0.1:8000',
      '/auth': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
      '/openapi.json': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'dist',
  },
})
