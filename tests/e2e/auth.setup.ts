import { test as setup, expect } from '@playwright/test';

/**
 * Authentication setup — logs in as Founder before all tests.
 * Saves auth state to reuse across tests.
 *
 * IMPORTANT: You must have a valid Founder account in your Supabase DB.
 * Set these environment variables:
 *   TEST_FOUNDER_EMAIL=founder@fundedwealth.com
 *   TEST_FOUNDER_PASSWORD=your-password
 */
setup('authenticate as founder', async ({ page }) => {
  const email = process.env.TEST_FOUNDER_EMAIL ?? 'founder@fundedwealth.com';
  const password = process.env.TEST_FOUNDER_PASSWORD ?? 'password123';

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL(/\/(executive|dashboard)/, { timeout: 15000 });

  // Save auth state
  await page.context().storageState({ path: 'tests/e2e/.auth/founder.json' });
});
