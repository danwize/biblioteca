import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  use: {
    baseURL: process.env.BIBLIOTECA_BASE_URL ?? 'http://localhost:5173'
  },
  webServer: process.env.BIBLIOTECA_BASE_URL ? undefined : {
    command: 'npm run dev --prefix ../../apps/web -- --host 127.0.0.1',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI
  }
})
