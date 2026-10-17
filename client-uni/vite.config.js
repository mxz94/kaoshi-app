import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    uni(),
  ],
  server: {
    port: 5180,
    proxy: {
      // H5 开发时把 /api 代理到本地后端（后端默认 3399）
      '/api': {
        target: 'http://localhost:3399',
        changeOrigin: true,
      },
    },
  },
})
