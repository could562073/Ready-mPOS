import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署路徑 — 對應 https://could562073.github.io/Ready-mPOS/
  base: '/Ready-mPOS/',
  // 版本號單一事實來源：package.json → 編譯期注入為全域常數 __APP_VERSION__（設定頁顯示）
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
})
