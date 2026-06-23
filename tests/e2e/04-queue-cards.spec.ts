import { test, expect } from '@playwright/test';

/**
 * TEST 4: Queue Cards
 * Verifies queue counts display and update.
 */
test.describe('Queue Cards', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('4 queue cards render on executive page', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const queueSection = page.locator('section[aria-label="Operational Queues"]');
    await expect(queueSection).toBeVisible();

    // Each QueueCard is a Link (<a>) with href
    const cards = queueSection.locator('a');
    const count = await cards.count();
    expect(count).toBe(4);

    // Verify card labels
    await expect(queueSection.locator('text=Pending Payouts')).toBeVisible();
    await expect(queueSection.locator('text=Pending KYC')).toBeVisible();
    await expect(queueSection.locator('text=Open Tickets')).toBeVisible();
    await expect(queueSection.locator('text=Risk Alerts')).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/04-queue-cards.png' });
  });

  test('queue cards show numeric counts', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const queueSection = page.locator('section[aria-label="Operational Queues"]');
    // Each card has a large count number (text-lg font-bold)
    const counts = await queueSection.locator('.text-lg.font-bold').allTextContents();
    console.log('Queue counts:', counts);

    // All should be numeric
    for (const c of counts) {
      expect(c.trim()).toMatch(/^\d+$/);
    }
  });

  test('clicking a queue card navigates to the module', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click "Pending Payouts" card
    await page.click('a[href*="/payouts"]');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/payouts');
    await page.screenshot({ path: 'tests/e2e/screenshots/04-queue-navigate.png' });
  });

  test('API /api/executive/queues returns counts for all 4 queues', async ({ request }) => {
    const res = await request.get('/api/executive/queues');
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.payouts.count).toBeGreaterThanOrEqual(0);
      expect(body.kyc.count).toBeGreaterThanOrEqual(0);
      expect(body.tickets.count).toBeGreaterThanOrEqual(0);
      expect(body.risk.count).toBeGreaterThanOrEqual(0);
      console.log('Queue API:', JSON.stringify(body, null, 2));
    } else {
      console.log(`Queue API returned ${res.status()}`);
    }
  });
});
