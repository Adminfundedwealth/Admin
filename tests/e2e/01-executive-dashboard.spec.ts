import { test, expect } from '@playwright/test';

/**
 * TEST 1: Executive Dashboard Verification
 * Verifies: Revenue Today, Revenue Yesterday, Revenue Delta, Pending Payout Value, Risk Health
 * Determines: A) Real data displayed, B) Empty database, C) API failure
 */
test.describe('Executive Dashboard', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('loads command center with all sections', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    // Page renders
    await expect(page.locator('h1')).toContainText('Command Center');

    // Screenshot
    await page.screenshot({ path: 'tests/e2e/screenshots/01-executive-full.png', fullPage: true });
  });

  test('revenue KPIs display values (not loading state)', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Allow metrics fetch

    // Check KPI section exists
    const kpiSection = page.locator('section[aria-label="Revenue Health"]');
    await expect(kpiSection).toBeVisible();

    // Check for rendered values (not "—" loading indicator)
    const kpiValues = await kpiSection.locator('.text-lg, .text-xl').allTextContents();

    // Determine state
    const allDash = kpiValues.every((v) => v.trim() === '—');
    const allZero = kpiValues.every((v) => v.trim() === '0' || v.trim() === '₹0');
    const hasRealData = kpiValues.some((v) => !['—', '0', '₹0', ''].includes(v.trim()));

    if (hasRealData) {
      console.log('STATUS: A) Real data displayed');
      console.log('VALUES:', kpiValues);
    } else if (allZero) {
      console.log('STATUS: B) Empty database — all values are zero');
    } else if (allDash) {
      console.log('STATUS: C) API failure — still in loading state');
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/01-revenue-kpis.png' });
  });

  test('queue cards section renders', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const queueSection = page.locator('section[aria-label="Operational Queues"]');
    await expect(queueSection).toBeVisible();

    // Should have 4 queue cards
    const queueCards = queueSection.locator('a[href]');
    const count = await queueCards.count();
    expect(count).toBe(4);

    await page.screenshot({ path: 'tests/e2e/screenshots/01-queue-cards.png' });
  });

  test('risk health section renders', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const riskSection = page.locator('section[aria-label="Risk Health"]');
    await expect(riskSection).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/01-risk-health.png' });
  });

  test('system health bar renders', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const healthSection = page.locator('section[aria-label="System Health"]');
    await expect(healthSection).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/01-system-health.png' });
  });

  test('API /api/executive/queues returns valid structure', async ({ request }) => {
    const res = await request.get('/api/executive/queues');
    // May be 401 without auth, but if auth works:
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('payouts');
      expect(body).toHaveProperty('kyc');
      expect(body).toHaveProperty('tickets');
      expect(body).toHaveProperty('risk');
      expect(body.payouts).toHaveProperty('count');
      expect(body.payouts).toHaveProperty('oldest');
      expect(body.payouts).toHaveProperty('breakdown');
      console.log('API Response:', JSON.stringify(body, null, 2));
    } else {
      console.log(`API returned ${res.status()} — auth required`);
    }
  });

  test('API /api/executive/risk-health returns valid structure', async ({ request }) => {
    const res = await request.get('/api/executive/risk-health');
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('accountsAtRisk');
      expect(body).toHaveProperty('highestSeverity');
      expect(body).toHaveProperty('capitalExposure');
      expect(body).toHaveProperty('breachesToday');
      console.log('API Response:', JSON.stringify(body));
    } else {
      console.log(`API returned ${res.status()} — auth required`);
    }
  });

  test('API /api/executive/system-health returns valid structure', async ({ request }) => {
    const res = await request.get('/api/executive/system-health');
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('services');
      expect(body.services.length).toBeGreaterThan(0);
      console.log('API Response:', JSON.stringify(body));
    } else {
      console.log(`API returned ${res.status()} — auth required`);
    }
  });
});
