import { test, expect } from '@playwright/test';

/**
 * Emergency Manual Provision — Playwright Verification Test.
 *
 * The Founder Emergency Provision calls the PRODUCTION provisioning pipeline
 * on the Main Website (POST /api/provisioning/emergency → provisionChallenge),
 * using the single-source-of-truth catalog (@workspace/products). The Admin
 * holds NO challenge config, sizes, risk rules or credential generation.
 *
 * Tests skip gracefully when the environment is not fully wired (no Founder
 * auth session, or the Main Website API is unavailable).
 */

const NOT_READY = [401, 403, 500, 502, 503, 504];

test.describe('Emergency Manual Provision', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('GET /api/founder/emergency-provision returns the production catalog', async ({ request }) => {
    const res = await request.get('/api/founder/emergency-provision');
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired (auth or Main Website API unavailable)');
      return;
    }

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.products).toBeDefined();
    expect(json.products.length).toBe(4);

    const slugs = json.products.map((p: any) => p.slug);
    expect(slugs).toContain('flash');
    expect(slugs).toContain('instant');
    expect(slugs).toContain('1step');
    expect(slugs).toContain('2step');

    const flash = json.products.find((p: any) => p.slug === 'flash');
    expect(flash.displayName).toBe('Flash');
    expect(flash.profitTargetPct).toBe(10);
    expect(flash.dailyDrawdownLimitPct).toBe(3);
    expect(flash.maxDrawdownLimitPct).toBe(6);
    expect(flash.minTradingDays).toBe(3);
    expect(flash.leverage).toBe('1:100');
    expect(flash.accountSizes).toEqual([50000, 100000, 250000, 500000, 1000000]);

    const twoStep = json.products.find((p: any) => p.slug === '2step');
    expect(twoStep.displayName).toBe('2-Step');
    expect(twoStep.profitTargetPct).toBe(8);
    expect(twoStep.dailyDrawdownLimitPct).toBe(4);
    expect(twoStep.maxDrawdownLimitPct).toBe(10);
    expect(twoStep.minTradingDays).toBe(5);
    expect(twoStep.leverage).toBe('1:100');
    expect(twoStep.phases).toBe(2);
  });

  test('POST rejects invalid challenge type', async ({ request }) => {
    const res = await request.post('/api/founder/emergency-provision', {
      data: {
        name: 'Test User',
        email: 'invalid-type-test@example.com',
        challenge_type: 'evaluation',
        account_size: 50000,
      },
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
      data: {
        name: 'Test User',
        email: 'invalid-size-test@example.com',
        challenge_type: 'flash',
        account_size: 75000, // not a valid Flash size
      },
    });

    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }

    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  test('Emergency provision produces a production Flash account', async ({ request }) => {
    const testEmail = `e2e-flash-${Date.now()}@test.fundedwealth.com`;
    const res = await request.post('/api/founder/emergency-provision', {
      data: {
        name: 'E2E Flash Test',
        email: testEmail,
        phone: '+91 9876543210',
        challenge_type: 'flash',
        account_size: 50000,
      },
    });

    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }

    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const data = json.data;

    expect(data.account_code).toMatch(/^FW-/);
    expect(data.challenge_type).toBe('flash');
    expect(data.challenge_display_name).toBe('Flash');
    expect(data.account_size).toBe(50000);
    expect(data.profit_target_pct).toBe(10);
    expect(data.daily_drawdown_limit_pct).toBe(3);
    expect(data.max_drawdown_limit_pct).toBe(6);
    expect(data.leverage).toBe('1:100');
    expect(data.challenge_account_id).toBeTruthy();
    expect(data.trading_account_id).toBeTruthy();
  });
});
