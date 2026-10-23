import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: ['fire.spec.ts', 'fire-touch.spec.ts'], grep: /@live/,
  fullyParallel: false, workers: 1, retries: 0,
  timeout: 45000, expect: { timeout: 5000 }, reporter: [['list']],
  use: {
    ...devices['iPhone 13'], browserName: 'webkit',
    baseURL: process.env.TEST_URL || 'http://127.0.0.1:4173/nitian/',
    headless: true, trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: process.env.TEST_URL ? undefined : {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/nitian/', reuseExistingServer: true,
  },
})
