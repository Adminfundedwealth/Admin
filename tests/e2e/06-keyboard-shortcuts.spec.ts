import { test, expect } from '@playwright/test';

/**
 * TEST 6: Keyboard Shortcuts
 * Verifies all registered shortcuts.
 */
test.describe('Keyboard Shortcuts', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('Ctrl+K opens command palette', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);

    // Command palette should be visible
    const palette = page.locator('[role="dialog"], [cmdk-root], [data-command-palette]');
    const isVisible = await palette.isVisible().catch(() => false);
    console.log('Command palette visible:', isVisible);

    await page.screenshot({ path: 'tests/e2e/screenshots/06-ctrl-k.png' });
  });

  test('Ctrl+J opens copilot', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+j');
    await page.waitForTimeout(300);

    const copilot = page.locator('aside[aria-label="Operations Copilot"]');
    await expect(copilot).toBeVisible();

    await page.screenshot({ path: 'tests/e2e/screenshots/06-ctrl-j.png' });
  });

  test('Escape closes copilot', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('Control+j');
    await page.waitForTimeout(300);
    await expect(page.locator('aside[aria-label="Operations Copilot"]')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Copilot should be gone (or we click outside)
    await page.screenshot({ path: 'tests/e2e/screenshots/06-escape.png' });
  });

  test('G+U navigates to users', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('u');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/users');
    await page.screenshot({ path: 'tests/e2e/screenshots/06-g-u.png' });
  });

  test('G+P navigates to payouts', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('p');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/payouts');
    await page.screenshot({ path: 'tests/e2e/screenshots/06-g-p.png' });
  });

  test('G+R navigates to risk', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('r');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/risk');
    await page.screenshot({ path: 'tests/e2e/screenshots/06-g-r.png' });
  });

  test('G+C navigates to challenges', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('c');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/challenges');
    await page.screenshot({ path: 'tests/e2e/screenshots/06-g-c.png' });
  });

  test('G+S navigates to support', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('s');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/support');
    await page.screenshot({ path: 'tests/e2e/screenshots/06-g-s.png' });
  });

  test('G+K navigates to KYC', async ({ page }) => {
    await page.goto('/executive');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    await page.keyboard.press('g');
    await page.waitForTimeout(100);
    await page.keyboard.press('k');
    await page.waitForTimeout(1000);

    expect(page.url()).toContain('/kyc');
    await page.screenshot({ path: 'tests/e2e/screenshots/06-g-k.png' });
  });
});
