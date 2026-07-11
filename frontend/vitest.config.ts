import { defineConfig } from 'vitest/config'

// Vitest 設定：純函式單元測試用 node 環境，不需要 DOM
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
