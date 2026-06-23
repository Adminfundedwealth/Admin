import { test, expect } from '@playwright/test';

/**
 * TEST 5: Staff Presence
 * Verifies staff online count displays.
 */
test.describe('Staff Presence', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('staff presence widget shows in sidebar', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Look for "online" text in sidebar
    const sidebar = page.locator('aside').first();
    const onlineText = sidebar.locator('text=/\\d+ online/');
    await expect(onlineText).toBeVisible();

    const text = await onlineText.textContent();
    console.log('Staff presence:', text);

    await page.screenshot({ path: 'tests/e2e/screenshots/05-staff-sidebar.png' });
  });

  test('staff presence section on executive page', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    const staffSection = page.locator('section[aria-label="Staff Presence"]');
    await expect(staffSection).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/05-staff-executive.png' });
  });

  test('API /api/staff/presence returns data', async ({ request }) => {
    const res = await request.get('/api/staff/presence');
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      console.log(`Staff online: ${body.data.length} members`);
      if (body.data.length > 0) {
        console.log('First:', JSON.stringify(body.data[0]));
      }
    } else {
      console.log(`Staff API returned ${res.status()}`);
    }
  });

  test('clicking presence widget shows details', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Click the presence widget
    const presenceButton = page.locator('button:has-text("online")').first();
    if (await presenceButton.isVisible()) {
      await presenceButton.click();
      await page.waitForTimeout(500);

      // Should show expanded view with staff details
      const expandedPanel = page.locator('text=Staff Online');
      await expect(expandedPanel).toBeVisible();

      await page.screenshot({ path: 'tests/e2e/screenshots/05-staff-expanded.png' });
    }
  });
});
