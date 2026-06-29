import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './specs',
  use: {
    baseURL: process.env.BIBLIOTECA_BASE_URL ?? 'http://localhost:8080'
  }
})
