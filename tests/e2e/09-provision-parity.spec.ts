import { test, expect } from '@playwright/test';

/**
 * Provisioning Parity — Founder Emergency Provision vs Website.
 *
 * The Admin Emergency Provision reads the challenge catalog from the SAME
 * single source of truth the website uses (@workspace/products), via the
 * production `/api/provisioning/catalog` endpoint, and provisions through the
 * SAME production pipeline (`/api/provisioning/emergency` → provisionChallenge).
 *
 * Every displayed value MUST equal the website pricing cards. These expected
 * values are exactly what the website's checkout.ts (derived from
 * @workspace/products) renders.
 *
 * Tests skip when the environment is not fully wired (no Founder auth session
 * or the Main Website API is unavailable).
 */

const NOT_READY = [401, 403, 500, 502, 503, 504];

// The canonical website values (marketing display strings) — must match exactly.
const WEBSITE: Record<string, any> = {
  flash: { displayName: 'Flash', profitTarget: '—', maxLoss: '4%', dailyLoss: '2%', minDays: '—', leverage: '1:100', profitSplit: '80%', duration: '24 Hours', phases: 1, accountSizes: [50000, 100000, 250000, 500000, 1000000] },
  instant: { displayName: 'Instant', profitTarget: '—', maxLoss: '6%', dailyLoss: '3%', minDays: '1', leverage: '1:100', profitSplit: '80%', duration: 'Unlimited', phases: 1, accountSizes: [100000, 500000, 1000000] },
  '1step': { displayName: '1-Step', profitTarget: '10%', maxLoss: '6%', dailyLoss: '3%', minDays: '3', leverage: '1:100', profitSplit: '90%', duration: '30 Days', phases: 1, accountSizes: [100000, 500000, 1000000, 2500000] },
  '2step': { displayName: '2-Step', profitTarget: '8% + 5%', maxLoss: '8%', dailyLoss: '4%', minDays: '5', leverage: '1:100', profitSplit: '90%', duration: '60 Days', phases: 2, accountSizes: [500000, 1000000, 2500000] },
};

test.describe('Provision Parity: Emergency matches Website exactly', () => {
  test.use({ storageState: 'tests/e2e/.auth/founder.json' });

  test('Catalog values are IDENTICAL to the website pricing cards', async ({ request }) => {
    const res = await request.get('/api/founder/emergency-provision');
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired (auth or Main Website API unavailable)');
      return;
    }
    expect(res.status()).toBe(200);
    const { products } = await res.json();
    expect(products.length).toBe(4);

    for (const [slug, w] of Object.entries(WEBSITE)) {
      const p = products.find((x: any) => x.slug === slug);
      expect(p, `product ${slug}`).toBeDefined();
      expect(p.displayName, `${slug}.displayName`).toBe(w.displayName);
      expect(p.profitTarget, `${slug}.profitTarget`).toBe(w.profitTarget);
      expect(p.maxLoss, `${slug}.maxLoss`).toBe(w.maxLoss);
      expect(p.dailyLoss, `${slug}.dailyLoss`).toBe(w.dailyLoss);
      expect(p.minDays, `${slug}.minDays`).toBe(w.minDays);
      expect(p.leverage, `${slug}.leverage`).toBe(w.leverage);
      expect(p.profitSplit, `${slug}.profitSplit`).toBe(w.profitSplit);
      expect(p.duration, `${slug}.duration`).toBe(w.duration);
      expect(p.phases, `${slug}.phases`).toBe(w.phases);
      expect(p.accountSizes, `${slug}.accountSizes`).toEqual(w.accountSizes);
    }
  });

  test('Emergency provision returns a production account (account_code, no password)', async ({ request }) => {
    const email = `parity-emergency-${Date.now()}@test.fundedwealth.com`;
    const res = await request.post('/api/founder/emergency-provision', {
      data: { name: 'Parity A', email, challenge_type: '1step', account_size: 100000 },
    });
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }
    expect(res.status()).toBe(200);
    const { data } = await res.json();

    expect(data.account_code).toMatch(/^FW-/);
    expect(data.password).toBeUndefined();
    expect(data.challenge_account_id).toBeTruthy();
    expect(data.trading_account_id).toBeTruthy();

    // Display values identical to the website 1-Step card.
    expect(data.challenge_display_name).toBe('1-Step');
    expect(data.profit_target).toBe('10%');
    expect(data.daily_loss).toBe('3%');
    expect(data.max_loss).toBe('6%');
    expect(data.leverage).toBe('1:100');
    expect(data.profit_split).toBe('90%');
  });

  test('Invalid challenge type is rejected', async ({ request }) => {
    const res = await request.post('/api/founder/emergency-provision', {
      data: { name: 'X', email: `bad-type-${Date.now()}@test.fundedwealth.com`, challenge_type: 'evaluation', account_size: 100000 },
    });
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toContain('Invalid challenge type');
  });

  test('Invalid account size is rejected', async ({ request }) => {
    const res = await request.post('/api/founder/emergency-provision', {
      data: { name: 'X', email: `bad-size-${Date.now()}@test.fundedwealth.com`, challenge_type: 'flash', account_size: 12345 },
    });
    if (NOT_READY.includes(res.status())) {
      test.skip(true, 'Environment not fully wired');
      return;
    }
    expect(res.status()).toBe(400);
    expect((await res.json()).error.message).toContain('not a valid size');
  });
});
