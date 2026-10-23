import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: 'clash.spec.ts', fullyParallel: false, workers: 1, retries: 0,
  timeout: 90000, expect: { timeout: 5000 },
  outputDir: 'test-results/clash-webkit',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/clash-webkit', open: 'never' }]],
  use: {
    baseURL: process.env.TEST_URL || 'http://127.0.0.1:4173/nitian/',
    browserName: 'webkit', headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: process.env.TEST_URL ? undefined : {
    command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173/nitian/', reuseExistingServer: true,
  },
})
