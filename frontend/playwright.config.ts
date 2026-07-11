import { defineConfig, devices } from '@playwright/test'

// Playwright E2E 設定
// - 測試目錄與 Vitest（src/**/*.test.ts）完全分開，避免互相誤抓
// - 只跑 chromium、headless（WSL2 無 GUI 環境）
// - webServer 用 `npm run dev` 啟本地 Vite server；baseURL 需含 vite.config.ts 的 base
//   （本專案部署 GitHub Pages，base 為 '/Ready-mPOS/'，缺少會導致頁面 404）
// ⚠️ reuseExistingServer=true + 固定 port 的陷阱：若另一個 checkout（如主 repo 的驗收 server）
//    已佔用該 port，E2E 會連到「舊程式碼」的 server 而測不到本 checkout 的變更。
//    E2E_PORT 環境變數可換 port 強制啟動本 checkout 自己的 dev server。
const PORT = Number(process.env.E2E_PORT) || 5173
const BASE_PATH = '/Ready-mPOS/'
const BASE_URL = `http://localhost:${PORT}${BASE_PATH}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    // WSL2 + /mnt/c 檔案系統較慢，拉長啟動逾時
    timeout: 120_000,
  },
})
