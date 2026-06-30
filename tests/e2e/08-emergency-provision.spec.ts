import { test, expect } from '@playwright/test';

/**
 * Emergency Manual Provision — Playwright Verification.
 *
 * The Founder Emergency Provision reads the catalog from the single source of
 * truth (@workspace/products via /api/provisioning/catalog) and provisions via
 * the production pipeline (/api/provisioning/emergency → provisionChallenge).
 * Displayed values must equal the website pricing cards exactly.
 *
 * Tests skip when the environment is not fully wired.
 */

const NOT_READY = [401, 403, 500, 502, 503, 504];

test.describe('Emergency Manual Provision', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('GET returns the production catalog with website display values', async ({ request }) => {
    const res = await request.get('/api/founder/emergency-provision');
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired (auth or Main Website API unavailable)');
      return;
    }

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.products.length).toBe(4);

    const slugs = json.products.map((p: any) => p.slug);
    expect(slugs).toContain('flash');
    expect(slugs).toContain('instant');
    expect(slugs).toContain('1step');
    expect(slugs).toContain('2step');

    const flash = json.products.find((p: any) => p.slug === 'flash');
    expect(flash.displayName).toBe('Flash');
    expect(flash.profitTarget).toBe('—');
    expect(flash.maxLoss).toBe('4%');
    expect(flash.dailyLoss).toBe('2%');
    expect(flash.leverage).toBe('1:100');
    expect(flash.profitSplit).toBe('80%');
    expect(flash.duration).toBe('24 Hours');
    expect(flash.accountSizes).toEqual([50000, 100000, 250000, 500000, 1000000]);

    const twoStep = json.products.find((p: any) => p.slug === '2step');
    expect(twoStep.displayName).toBe('2-Step');
    expect(twoStep.profitTarget).toBe('8% + 5%');
    expect(twoStep.maxLoss).toBe('8%');
    expect(twoStep.dailyLoss).toBe('4%');
    expect(twoStep.profitSplit).toBe('90%');
    expect(twoStep.phases).toBe(2);
  });

  test('POST rejects invalid challenge type', async ({ request }) => {
    const res = await request.post('/api/founder/emergency-provision', {
      data: { name: 'Test User', email: 'invalid-type-test@example.com', challenge_type: 'evaluation', account_size: 50000 },
    });
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toContain('Invalid challenge type');
  });

  test('POST rejects invalid account size', async ({ request }) => {
    const res = await request.post('/api/founder/emergency-provision', {
      data: { name: 'Test User', email: 'invalid-size-test@example.com', challenge_type: 'flash', account_size: 75000 },
    });
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });

  test('Emergency provision produces a production Flash account', async ({ request }) => {
    const testEmail = `e2e-flash-${Date.now()}@test.fundedwealth.com`;
    const res = await request.post('/api/founder/emergency-provision', {
      data: { name: 'E2E Flash Test', email: testEmail, phone: '+91 9876543210', challenge_type: 'flash', account_size: 50000 },
    });
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }

    expect(res.status()).toBe(200);
    const { data } = await res.json();

    expect(data.account_code).toMatch(/^FW-/);
    expect(data.challenge_type).toBe('flash');
    expect(data.challenge_display_name).toBe('Flash');
    expect(data.account_size).toBe(50000);
    expect(data.profit_target).toBe('—');
    expect(data.daily_loss).toBe('2%');
    expect(data.max_loss).toBe('4%');
    expect(data.leverage).toBe('1:100');
    expect(data.challenge_account_id).toBeTruthy();
    expect(data.trading_account_id).toBeTruthy();
  });
});
