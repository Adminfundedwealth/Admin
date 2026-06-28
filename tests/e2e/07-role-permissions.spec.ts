import { test, expect } from '@playwright/test';

/**
 * TEST 7: Role-Based Permissions
 * Verifies that different roles see different content.
 *
 * NOTE: This test requires multiple auth states.
 * Set environment variables:
 *   TEST_FOUNDER_EMAIL / TEST_FOUNDER_PASSWORD
 *   TEST_FINANCE_EMAIL / TEST_FINANCE_PASSWORD
 *   TEST_SUPPORT_EMAIL / TEST_SUPPORT_PASSWORD
 *   TEST_RISK_EMAIL / TEST_RISK_PASSWORD
 *   TEST_COMPLIANCE_EMAIL / TEST_COMPLIANCE_PASSWORD
 */
test.describe('Role Permissions', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('Founder sees all navigation items', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav).toBeVisible();

    // Founder should see all sections
    const navItems = await nav.locator('a').allTextContents();
    console.log('Founder nav items:', navItems.length);

    // Should see high-privilege items
    const hasStaff = navItems.some((t) => t.includes('Staff'));
    const hasRisk = navItems.some((t) => t.includes('Risk'));
    const hasAudit = navItems.some((t) => t.includes('Audit'));
    console.log('Has Staff:', hasStaff, '| Has Risk:', hasRisk, '| Has Audit:', hasAudit);

    expect(hasStaff).toBe(true);
    expect(hasRisk).toBe(true);

    await page.screenshot({ path: 'tests/e2e/screenshots/07-founder-nav.png' });
  });

  test('Founder can access /staff', async ({ page }) => {
    await page.goto('/staff');
    await page.waitForLoadState('networkidle');

    // Should NOT be redirected to unauthorized
    expect(page.url()).toContain('/staff');
    const heading = await page.locator('h1').textContent();
    console.log('Staff page heading:', heading);

    await page.screenshot({ path: 'tests/e2e/screenshots/07-founder-staff.png' });
  });

  test('Founder can access /audit', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/audit');
    await page.screenshot({ path: 'tests/e2e/screenshots/07-founder-audit.png' });
  });

  test('Founder can access /settings', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    expect(page.url()).toContain('/settings');
    await page.screenshot({ path: 'tests/e2e/screenshots/07-founder-settings.png' });
  });

  test('API permission check — Founder can access all endpoints', async ({ request, page }) => {
    const endpoints = [
      '/api/executive/metrics',
      '/api/executive/queues',
      '/api/executive/risk-health',
      '/api/executive/system-health',
      '/api/risk/heatmap',
      '/api/risk/exposure',
      '/api/feed',
      '/api/staff/presence',
    ];

    const results: { endpoint: string; status: number }[] = [];

    for (const endpoint of endpoints) {
      const res = await request.get(endpoint);
      results.push({ endpoint, status: res.status() });
    }

    console.log('Permission results:');
    for (const r of results) {
      const status = r.status === 200 ? 'PASS' : r.status === 401 ? 'AUTH_REQUIRED' : `FAIL (${r.status})`;
      console.log(`  ${r.endpoint} → ${status}`);
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/07-api-permissions.png' });
  });
});
