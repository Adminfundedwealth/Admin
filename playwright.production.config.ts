/**
 * playwright.production.config.ts
 *
 * Playwright configuration for the full production audit.
 * Targets https://admin.fundedwealth.com directly.
 * No local dev server needed.
 *
 * Run: npx playwright test --config=playwright.production.config.ts
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['full-audit.spec.ts'],
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [
    ['html', { outputFolder: 'playwright-report-production', open: 'never' }],
    ['list'],
    ['json', { outputFile: 'C:\\Users\\rmsam\\fundedwealth\\.agents\\tasks\\admin-os-audit\\playwright-json-report.json' }],
  ],
  use: {
    baseURL: 'https://admin.fundedwealth.com',
    storageState: 'tests/e2e/.auth/founder.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1440, height: 900 },
    // No local server — testing production directly
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — this config connects directly to production
});
