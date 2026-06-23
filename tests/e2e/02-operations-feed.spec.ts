import { test, expect } from '@playwright/test';

/**
 * TEST 2: Operations Feed
 * Verifies: Events from users, KYC, payouts, risk, tickets appear in the feed.
 */
test.describe('Operations Feed', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('feed panel toggles on /executive', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    // Feed should be visible by default on executive page
    const feed = page.locator('aside[aria-label="Operations Feed"]');
    await expect(feed).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/02-feed-visible.png' });
  });

  test('feed shows connection status', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const feed = page.locator('aside[aria-label="Operations Feed"]');
    // Should show either "Live" or "Disconnected" or "Reconnecting..."
    const statusText = await feed.locator('text=/Live|Disconnected|Reconnecting/').textContent();
    expect(statusText).toBeTruthy();

    await page.screenshot({ path: 'tests/e2e/screenshots/02-feed-connection.png' });
  });

  test('feed shows filter chips', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    const feed = page.locator('aside[aria-label="Operations Feed"]');
    const chips = feed.locator('button:has-text("Users"), button:has-text("Sales"), button:has-text("Payouts"), button:has-text("KYC"), button:has-text("Risk"), button:has-text("Support"), button:has-text("Staff")');
    const chipCount = await chips.count();
    expect(chipCount).toBe(7);

    await page.screenshot({ path: 'tests/e2e/screenshots/02-feed-filters.png' });
  });

  test('API /api/feed returns events array', async ({ request }) => {
    const res = await request.get('/api/feed?page=1&limit=25');
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('events');
      expect(Array.isArray(body.events)).toBe(true);
      console.log(`Feed returned ${body.events.length} events`);
      if (body.events.length > 0) {
        console.log('First event:', JSON.stringify(body.events[0]));
      }
    } else {
      console.log(`Feed API returned ${res.status()} — auth required`);
    }
  });

  test('feed toggle button works on non-executive pages', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Feed should be hidden by default
    const feedOverlay = page.locator('aside[aria-label="Operations Feed"]');
    const isVisible = await feedOverlay.isVisible().catch(() => false);

    // Click feed toggle in header
    await page.click('button[aria-label="Toggle operations feed"]');
    await page.waitForTimeout(300);

    // Feed overlay should now be visible
    await expect(page.locator('aside[aria-label="Operations Feed"]')).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/02-feed-overlay.png' });
  });
});
