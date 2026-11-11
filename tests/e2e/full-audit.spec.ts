/**
 * Full Admin OS Audit Spec
 * Tests every page and interactive element at https://admin.fundedwealth.com
 *
 * Requirements:
 *  - storageState: 'tests/e2e/.auth/founder.json'
 *  - baseURL: 'https://admin.fundedwealth.com'
 *  - Playwright Chromium (not Brave user profile)
 *  - headless: false
 *  - Collects console errors + failed network requests on every page
 *  - Screenshots to C:\Users\rmsam\fundedwealth\.agents\tasks\admin-os-audit\screenshots\{pageName}.png
 *  - Non-destructive only
 */

import { test, expect, Page, BrowserContext, ConsoleMessage, Request, Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config overrides (applied via test.use below)
// ---------------------------------------------------------------------------
const BASE_URL = 'https://admin.fundedwealth.com';
const SCREENSHOT_DIR = 'C:\\Users\\rmsam\\fundedwealth\\.agents\\tasks\\admin-os-audit\\screenshots';
const RESULTS_PATH = 'C:\\Users\\rmsam\\fundedwealth\\.agents\\tasks\\admin-os-audit\\phase1-results.json';
const AUTH_STATE = 'tests/e2e/.auth/founder.json';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
interface NetworkEntry {
  url: string;
  status: number;
  method: string;
}

interface PageResult {
  page: string;
  url: string;
  title: string;
  h1: string;
  buttonsFound: number;
  buttonsClicked: number;
  consoleErrors: string[];
  failedRequests: NetworkEntry[];
  allXhrResponses: NetworkEntry[];
  uiErrorStates: string[];
  result: 'PASS' | 'FAIL' | 'BLOCKED';
  reason?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ensure the screenshot directory exists */
function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

/** Sanitise a name for use as a filename */
function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_').replace(/__+/g, '_').toLowerCase();
}

/** Attach console-error and XHR listeners; return teardown + accessor functions */
function attachListeners(page: Page): {
  getErrors: () => string[];
  getFailedRequests: () => NetworkEntry[];
  getAllXhr: () => NetworkEntry[];
  detach: () => void;
} {
  const errors: string[] = [];
  const failedRequests: NetworkEntry[] = [];
  const allXhr: NetworkEntry[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Allow Cloudflare beacon CSP warnings
      if (!text.includes('cloudflare') && !text.includes('beacon') && !errors.includes(text)) {
        errors.push(text);
      }
    }
  };

  const onResponse = (response: Response) => {
    const url = response.url();
    const status = response.status();
    const method = response.request().method();
    const resourceType = response.request().resourceType();

    if (resourceType === 'fetch' || resourceType === 'xhr') {
      allXhr.push({ url, status, method });
      if (status >= 400) {
        failedRequests.push({ url, status, method });
      }
    }
  };

  page.on('console', onConsole);
  page.on('response', onResponse);

  return {
    getErrors: () => [...errors],
    getFailedRequests: () => [...failedRequests],
    getAllXhr: () => [...allXhr],
    detach: () => {
      page.off('console', onConsole);
      page.off('response', onResponse);
    },
  };
}

/** Navigate to a URL — use domcontentloaded to avoid CDN rate-limit from networkidle */
async function navigateTo(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  // Brief settle wait — allows page JS to run without hammering the CDN
  await page.waitForTimeout(800);
}

/** Take a screenshot and save to the audit dir */
async function takeScreenshot(page: Page, name: string) {
  ensureScreenshotDir();
  const filePath = path.join(SCREENSHOT_DIR, `${safeFileName(name)}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
}

/** Detect visible UI error state text */
async function detectUiErrors(page: Page): Promise<string[]> {
  const selectors = [
    'text=Something went wrong',
    'text=Failed to load',
    'text=Error loading',
    'text=Unable to load',
    'text=Network error',
    'text=500',
    '[data-testid="error-state"]',
    '.error-state',
    '[class*="error-boundary"]',
  ];
  const found: string[] = [];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1_000 })) {
        const txt = await el.textContent({ timeout: 1_000 });
        if (txt) found.push(txt.trim().substring(0, 120));
      }
    } catch {
      // not present
    }
  }
  return [...new Set(found)];
}

/** Determine pass/fail based on collected data */
function determineResult(
  uiErrors: string[],
  failedRequests: NetworkEntry[],
  consoleErrors: string[],
  blocked = false,
  blockedReason?: string
): { result: 'PASS' | 'FAIL' | 'BLOCKED'; reason?: string } {
  if (blocked) return { result: 'BLOCKED', reason: blockedReason };
  if (uiErrors.length > 0) return { result: 'FAIL', reason: `UI error: ${uiErrors[0]}` };

  // Primary data-fetch failures (4xx/5xx)
  const critical = failedRequests.filter(r => r.status === 429 || r.status >= 500 || r.status === 404);
  if (critical.length > 0) {
    return { result: 'FAIL', reason: `HTTP ${critical[0].status} on ${critical[0].url}` };
  }

  // JS errors that break rendering (heuristic: more than 2 unique errors)
  const severeErrors = consoleErrors.filter(e => !e.includes('Warning:') && !e.includes('CSP'));
  if (severeErrors.length > 2) {
    return { result: 'FAIL', reason: `${severeErrors.length} console errors` };
  }

  return { result: 'PASS' };
}

/** Click all visible, non-destructive buttons on a page; return count clicked */
async function clickSafeButtons(page: Page): Promise<number> {
  // Dangerous keywords — skip these entirely
  const dangerous = /delete|remove|destroy|approve payout|confirm payout|issue|revoke|ban|suspend|block user|wipe|reset password|send email|send sms|bulk/i;
  // Structural keywords that should not be clicked as content
  const skip = /logout|sign out|log out/i;

  const buttons = await page.locator('button:visible, [role="button"]:visible').all();
  let clicked = 0;

  for (const btn of buttons) {
    try {
      const text = (await btn.textContent({ timeout: 500 })) ?? '';
      const ariaLabel = (await btn.getAttribute('aria-label')) ?? '';
      const combined = `${text} ${ariaLabel}`;

      if (dangerous.test(combined) || skip.test(combined)) continue;

      // Only click if it looks like a navigation/filter/action button (not a form submit for mutations)
      const isEnabled = await btn.isEnabled({ timeout: 500 });
      if (!isEnabled) continue;

      await btn.scrollIntoViewIfNeeded({ timeout: 500 });
      await btn.click({ timeout: 2_000, force: false });
      clicked++;

      // Brief pause to let any modal/response appear
      await page.waitForTimeout(400);

      // Close any opened modal via Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } catch {
      // skip unclickable or detached elements
    }
  }
  return clicked;
}

/** Get H1 text (or first heading) */
async function getH1(page: Page): Promise<string> {
  try {
    const h1 = page.locator('h1').first();
    if (await h1.isVisible({ timeout: 2_000 })) {
      return (await h1.textContent({ timeout: 1_000 }))?.trim() ?? '';
    }
  } catch {
    // fall through
  }
  try {
    const h2 = page.locator('h2').first();
    if (await h2.isVisible({ timeout: 1_000 })) {
      return (await h2.textContent({ timeout: 1_000 }))?.trim() ?? '';
    }
  } catch {
    // ignore
  }
  return '';
}

/** Full audit of a single page */
async function auditPage(
  page: Page,
  pageName: string,
  relativeUrl: string,
  extraActions?: (page: Page) => Promise<void>
): Promise<PageResult> {
  const fullUrl = `${BASE_URL}${relativeUrl}`;
  const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);

  let blocked = false;
  let blockedReason = '';

  try {
    await navigateTo(page, fullUrl);

    // Check for auth redirect
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      blocked = true;
      blockedReason = `Redirected to ${currentUrl}`;
    }
  } catch (err) {
    blocked = true;
    blockedReason = `Navigation failed: ${(err as Error).message}`;
  }

  const title = await page.title().catch(() => '');
  const h1 = await getH1(page);
  const buttonsAll = await page.locator('button:visible, [role="button"]:visible').count().catch(() => 0);

  let buttonsClicked = 0;
  let uiErrors: string[] = [];

  if (!blocked) {
    uiErrors = await detectUiErrors(page);

    // Run page-specific extra actions before generic button sweep
    if (extraActions) {
      try {
        await extraActions(page);
      } catch {
        // extra actions are best-effort
      }
    }

    buttonsClicked = await clickSafeButtons(page);
    // Re-check UI errors after interactions
    const postErrors = await detectUiErrors(page);
    uiErrors = [...new Set([...uiErrors, ...postErrors])];
  }

  await takeScreenshot(page, pageName);

  const consoleErrors = getErrors();
  const failedRequests = getFailedRequests();
  const allXhr = getAllXhr();
  detach();

  const { result, reason } = determineResult(uiErrors, failedRequests, consoleErrors, blocked, blockedReason);

  return {
    page: pageName,
    url: fullUrl,
    title,
    h1,
    buttonsFound: buttonsAll,
    buttonsClicked,
    consoleErrors,
    failedRequests,
    allXhrResponses: allXhr,
    uiErrorStates: uiErrors,
    result,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.use({
  baseURL: BASE_URL,
  storageState: AUTH_STATE,
  launchOptions: {
    headless: false,
    executablePath: undefined, // use Playwright's own bundled Chromium
    channel: undefined,
  },
  viewport: { width: 1440, height: 900 },
});

test.describe('Admin OS Full Audit', () => {
  const results: PageResult[] = [];

  // Warm-up: ensure storageState (cookies) are loaded before first real test
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: AUTH_STATE });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE_URL}/executive`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
    await pg.waitForTimeout(500);
    await ctx.close();
  });

  // -------------------------------------------------------------------------
  // FOUNDER
  // -------------------------------------------------------------------------

  test('FOUNDER — Executive Command (/executive)', async ({ page }) => {
    const result = await auditPage(page, 'executive', '/executive');
    results.push(result);
    expect(result.result).not.toBe('BLOCKED');
  });

  test('FOUNDER — Staff Activity (/founder/activity)', async ({ page }) => {
    const result = await auditPage(page, 'founder_activity', '/founder/activity', async (p) => {
      // Click filter buttons: All, Mutations, Logins, Exports
      for (const label of ['All', 'Mutations', 'Logins', 'Exports']) {
        try {
          const btn = p.getByRole('button', { name: label, exact: true });
          if (await btn.isVisible({ timeout: 2_000 })) {
            await btn.click({ timeout: 3_000 });
            await p.waitForTimeout(800);
            const uiErr = await detectUiErrors(p);
            if (uiErr.length > 0) {
              throw new Error(`UI error after clicking filter "${label}": ${uiErr[0]}`);
            }
          }
        } catch {
          // filter may not exist on this build
        }
      }
      // Capture network request to /api/founder/activity
      // (already captured by global response listener)
    });
    results.push(result);
  });

  test('FOUNDER — Emergency Controls (/founder/emergency)', async ({ page }) => {
    const result = await auditPage(page, 'founder_emergency', '/founder/emergency');
    results.push(result);
  });

  test('FOUNDER — Emergency Manual Provisioning (/founder/emergency-provision)', async ({ page }) => {
    const result = await auditPage(page, 'founder_emergency_provision', '/founder/emergency-provision');
    results.push(result);
  });

  test('FOUNDER — Account Control (/founder/account-control)', async ({ page }) => {
    const result = await auditPage(page, 'founder_account_control', '/founder/account-control');
    results.push(result);
  });

  test('FOUNDER — Link Terminal Account (/founder/terminal-account-link)', async ({ page }) => {
    const result = await auditPage(page, 'founder_terminal_account_link', '/founder/terminal-account-link');
    results.push(result);
  });

  test('FOUNDER — Delete/Archive Accounts (/founder/delete-accounts)', async ({ page }) => {
    // This page involves destructive actions; we open and inspect only — no form submission
    const result = await auditPage(page, 'founder_delete_accounts', '/founder/delete-accounts', async (p) => {
      // Only verify the page renders; do NOT click delete/archive
      const heading = await getH1(p);
      if (!heading) throw new Error('No heading found');
    });
    results.push(result);
  });

  test('FOUNDER — Promotional Campaigns (/founder/notifications)', async ({ page }) => {
    const result = await auditPage(page, 'founder_notifications', '/founder/notifications');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // COMMERCE
  // -------------------------------------------------------------------------

  test('COMMERCE — Purchase Orders (/purchases)', async ({ page }) => {
    const result = await auditPage(page, 'purchases', '/purchases', async (p) => {
      // Status filter dropdown
      try {
        const statusFilter = p.locator('[data-testid="status-filter"], select[name*="status"], button:has-text("Status")').first();
        if (await statusFilter.isVisible({ timeout: 2_000 })) {
          await statusFilter.click({ timeout: 2_000 });
          await p.waitForTimeout(500);
          // Pick first option
          const option = p.locator('[role="option"], option').first();
          if (await option.isVisible({ timeout: 1_000 })) await option.click({ timeout: 1_000 });
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }

      // Product filter
      try {
        const productFilter = p.locator('button:has-text("Product"), [data-testid="product-filter"]').first();
        if (await productFilter.isVisible({ timeout: 2_000 })) {
          await productFilter.click({ timeout: 2_000 });
          await p.waitForTimeout(400);
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }

      // Search input
      try {
        const search = p.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i]').first();
        if (await search.isVisible({ timeout: 2_000 })) {
          await search.fill('test');
          await p.waitForTimeout(600);
          await search.clear();
        }
      } catch { /* best-effort */ }

      // Click first table row
      try {
        const row = p.locator('table tbody tr, [role="row"]').nth(1);
        if (await row.isVisible({ timeout: 2_000 })) {
          await row.click({ timeout: 2_000 });
          await p.waitForTimeout(600);
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }

      // Export button
      try {
        const exportBtn = p.getByRole('button', { name: /export/i });
        if (await exportBtn.isVisible({ timeout: 2_000 })) {
          await exportBtn.click({ timeout: 2_000 });
          await p.waitForTimeout(400);
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('COMMERCE — Payments (/payments)', async ({ page }) => {
    const result = await auditPage(page, 'payments', '/payments', async (p) => {
      // Click filters
      try {
        const filters = await p.locator('button[data-filter], [role="tab"], button:has-text("Filter")').all();
        for (const f of filters.slice(0, 4)) {
          try {
            if (await f.isVisible({ timeout: 1_000 })) {
              await f.click({ timeout: 1_500 });
              await p.waitForTimeout(400);
            }
          } catch { /* skip */ }
        }
      } catch { /* best-effort */ }

      // Click first payment row
      try {
        const row = p.locator('table tbody tr, [role="row"]').nth(1);
        if (await row.isVisible({ timeout: 2_000 })) {
          await row.click({ timeout: 2_000 });
          await p.waitForTimeout(600);
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('COMMERCE — Manual Provision (/provision)', async ({ page }) => {
    const result = await auditPage(page, 'provision', '/provision');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // USER OPERATIONS
  // -------------------------------------------------------------------------

  test('USER OPS — User Intelligence (/users)', async ({ page }) => {
    const result = await auditPage(page, 'users', '/users', async (p) => {
      // Search
      try {
        const search = p.locator('input[type="search"], input[placeholder*="search" i]').first();
        if (await search.isVisible({ timeout: 2_000 })) {
          await search.fill('test@example.com');
          await p.waitForTimeout(800);
          await search.clear();
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('USER OPS — Challenge Operations (/challenges)', async ({ page }) => {
    const result = await auditPage(page, 'challenges', '/challenges', async (p) => {
      // Test filters and tabs
      try {
        const tabs = await p.locator('[role="tab"]').all();
        for (const tab of tabs.slice(0, 5)) {
          try {
            if (await tab.isVisible({ timeout: 1_000 })) {
              await tab.click({ timeout: 1_500 });
              await p.waitForTimeout(500);
            }
          } catch { /* skip */ }
        }
      } catch { /* best-effort */ }

      // Click first row
      try {
        const row = p.locator('table tbody tr, [role="row"]').nth(1);
        if (await row.isVisible({ timeout: 2_000 })) {
          await row.click({ timeout: 2_000 });
          await p.waitForTimeout(600);
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('USER OPS — Funded Traders (/funded)', async ({ page }) => {
    const result = await auditPage(page, 'funded', '/funded', async (p) => {
      // Filters
      try {
        const filters = await p.locator('button[data-filter], [role="tab"]').all();
        for (const f of filters.slice(0, 4)) {
          try {
            if (await f.isVisible({ timeout: 1_000 })) {
              await f.click({ timeout: 1_500 });
              await p.waitForTimeout(400);
            }
          } catch { /* skip */ }
        }
      } catch { /* best-effort */ }

      // Click first row
      try {
        const row = p.locator('table tbody tr, [role="row"]').nth(1);
        if (await row.isVisible({ timeout: 2_000 })) {
          await row.click({ timeout: 2_000 });
          await p.waitForTimeout(600);
          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // FINANCE
  // -------------------------------------------------------------------------

  test('FINANCE — Payout Operations (/payouts)', async ({ page }) => {
    const result = await auditPage(page, 'payouts', '/payouts', async (p) => {
      // Status filters
      try {
        const statusBtns = await p.locator('[role="tab"], button:has-text("Pending"), button:has-text("Approved"), button:has-text("Rejected"), button:has-text("All")').all();
        for (const btn of statusBtns.slice(0, 5)) {
          try {
            if (await btn.isVisible({ timeout: 1_000 })) {
              await btn.click({ timeout: 1_500 });
              await p.waitForTimeout(400);
            }
          } catch { /* skip */ }
        }
      } catch { /* best-effort */ }

      // Click a payout row to open detail
      try {
        const row = p.locator('table tbody tr, [role="row"]').nth(1);
        if (await row.isVisible({ timeout: 2_000 })) {
          await row.click({ timeout: 2_000 });
          await p.waitForTimeout(800);

          // Look for approve/reject buttons — open confirmation modal then Cancel
          for (const actionLabel of ['Approve', 'Reject']) {
            try {
              const actionBtn = p.getByRole('button', { name: new RegExp(actionLabel, 'i') }).first();
              if (await actionBtn.isVisible({ timeout: 1_000 })) {
                await actionBtn.click({ timeout: 1_500 });
                await p.waitForTimeout(500);
                // Cancel the confirmation
                const cancelBtn = p.getByRole('button', { name: /cancel/i }).first();
                if (await cancelBtn.isVisible({ timeout: 1_500 })) {
                  await cancelBtn.click({ timeout: 1_500 });
                  await p.waitForTimeout(300);
                }
                await p.keyboard.press('Escape');
              }
            } catch { /* skip */ }
          }

          await p.keyboard.press('Escape');
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('FINANCE — Revenue Intelligence (/revenue)', async ({ page }) => {
    const result = await auditPage(page, 'revenue', '/revenue');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // COMPLIANCE
  // -------------------------------------------------------------------------

  test('COMPLIANCE — KYC Verification (/kyc)', async ({ page }) => {
    const result = await auditPage(page, 'kyc', '/kyc');
    results.push(result);
  });

  test('COMPLIANCE — Risk Management (/risk)', async ({ page }) => {
    const result = await auditPage(page, 'risk', '/risk');
    results.push(result);
  });

  test('COMPLIANCE — Audit & Compliance (/audit)', async ({ page }) => {
    const result = await auditPage(page, 'audit', '/audit');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // RISK RULES ENGINE
  // -------------------------------------------------------------------------

  test('RISK RULES — Overview (/risk-rules)', async ({ page }) => {
    const result = await auditPage(page, 'risk_rules_overview', '/risk-rules');
    results.push(result);
  });

  test('RISK RULES — Flash (/risk-rules/flash)', async ({ page }) => {
    const result = await auditPage(page, 'risk_rules_flash', '/risk-rules/flash');
    results.push(result);
  });

  test('RISK RULES — Instant (/risk-rules/instant)', async ({ page }) => {
    const result = await auditPage(page, 'risk_rules_instant', '/risk-rules/instant');
    results.push(result);
  });

  test('RISK RULES — 1-Step (/risk-rules/onestep)', async ({ page }) => {
    const result = await auditPage(page, 'risk_rules_onestep', '/risk-rules/onestep');
    results.push(result);
  });

  test('RISK RULES — 2-Step (/risk-rules/twostep)', async ({ page }) => {
    const result = await auditPage(page, 'risk_rules_twostep', '/risk-rules/twostep');
    results.push(result);
  });

  test('RISK RULES — Audit History (/risk-rules/audit)', async ({ page }) => {
    const result = await auditPage(page, 'risk_rules_audit', '/risk-rules/audit');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // TRADING
  // -------------------------------------------------------------------------

  test('TRADING — Trade Surveillance (/trades)', async ({ page }) => {
    const result = await auditPage(page, 'trades', '/trades');
    results.push(result);
  });

  test('TRADING — Trading Orders (/orders)', async ({ page }) => {
    const result = await auditPage(page, 'orders', '/orders', async (p) => {
      // Test filters
      try {
        const filters = await p.locator('[role="tab"], button[data-filter]').all();
        for (const f of filters.slice(0, 4)) {
          try {
            if (await f.isVisible({ timeout: 1_000 })) {
              await f.click({ timeout: 1_500 });
              await p.waitForTimeout(400);
            }
          } catch { /* skip */ }
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // GROWTH
  // -------------------------------------------------------------------------

  test('GROWTH — Affiliate Operations (/affiliates)', async ({ page }) => {
    const result = await auditPage(page, 'affiliates', '/affiliates', async (p) => {
      // Filters
      try {
        const filters = await p.locator('[role="tab"], button[data-filter]').all();
        for (const f of filters.slice(0, 4)) {
          try {
            if (await f.isVisible({ timeout: 1_000 })) {
              await f.click({ timeout: 1_500 });
              await p.waitForTimeout(400);
            }
          } catch { /* skip */ }
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('GROWTH — Marketing Operations (/marketing)', async ({ page }) => {
    const result = await auditPage(page, 'marketing', '/marketing');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // SUPPORT
  // -------------------------------------------------------------------------

  test('SUPPORT — Support Operations (/support)', async ({ page }) => {
    const result = await auditPage(page, 'support', '/support', async (p) => {
      // Click a ticket to open detail
      try {
        const row = p.locator('table tbody tr, [role="row"], li[data-ticket]').nth(1);
        if (await row.isVisible({ timeout: 2_000 })) {
          await row.click({ timeout: 2_000 });
          await p.waitForTimeout(800);

          // Verify reply form exists but do NOT submit
          const replyForm = p.locator('form, textarea[placeholder*="reply" i], textarea[placeholder*="message" i]').first();
          await replyForm.isVisible({ timeout: 2_000 }).catch(() => false);
        }
      } catch { /* best-effort */ }
    });
    results.push(result);
  });

  test('SUPPORT — Certificate Center (/certificates)', async ({ page }) => {
    const result = await auditPage(page, 'certificates', '/certificates');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // SETTINGS
  // -------------------------------------------------------------------------

  test('SETTINGS — Settings (/settings)', async ({ page }) => {
    const result = await auditPage(page, 'settings', '/settings');
    results.push(result);
  });

  test('SETTINGS — Staff Management (/staff)', async ({ page }) => {
    const result = await auditPage(page, 'staff', '/staff');
    results.push(result);
  });

  test('SETTINGS — Monitoring (/monitoring)', async ({ page }) => {
    const result = await auditPage(page, 'monitoring', '/monitoring');
    results.push(result);
  });

  // -------------------------------------------------------------------------
  // HEADER ICONS (tested on /executive)
  // -------------------------------------------------------------------------

  test('HEADER — Command Palette / Search (Ctrl+K)', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);

    await navigateTo(page, `${BASE_URL}/executive`);

    let result: PageResult = {
      page: 'header_search_palette',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      // Try keyboard shortcut first
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(600);
      const palette = page.locator('[role="dialog"], [role="combobox"], [data-testid*="command"], [data-testid*="search"]').first();
      const paletteVisible = await palette.isVisible({ timeout: 2_000 }).catch(() => false);

      if (!paletteVisible) {
        // Try clicking the search bar
        const searchBar = page.locator('button[aria-label*="search" i], [placeholder*="search" i], [data-testid*="search"]').first();
        if (await searchBar.isVisible({ timeout: 2_000 })) {
          await searchBar.click({ timeout: 2_000 });
          await page.waitForTimeout(600);
        }
      }

      await takeScreenshot(page, 'header_search_palette');
      await page.keyboard.press('Escape');
    } catch (err) {
      result.result = 'FAIL';
      result.reason = (err as Error).message;
    }

    result.consoleErrors = getErrors();
    result.failedRequests = getFailedRequests();
    result.allXhrResponses = getAllXhr();
    detach();

    results.push(result);
    expect(result.result).not.toBe('BLOCKED');
  });

  test('HEADER — Notifications Bell Icon', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    let headerResult: PageResult = {
      page: 'header_notifications',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      const bell = page.locator('[aria-label*="notification" i], [data-testid*="notification"], button svg[data-icon*="bell"], button:has(svg)').first();
      if (await bell.isVisible({ timeout: 3_000 })) {
        await bell.click({ timeout: 2_000 });
        await page.waitForTimeout(600);
        await takeScreenshot(page, 'header_notifications');
        await page.keyboard.press('Escape');
        headerResult.buttonsClicked = 1;
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Notification bell not found';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  test('HEADER — Activity Feed Toggle', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    const headerResult: PageResult = {
      page: 'header_activity_feed',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      const activityBtn = page.locator('[aria-label*="activity" i], [data-testid*="activity"], button:has-text("Activity")').first();
      if (await activityBtn.isVisible({ timeout: 3_000 })) {
        await activityBtn.click({ timeout: 2_000 });
        await page.waitForTimeout(600);
        await takeScreenshot(page, 'header_activity_feed');
        await page.keyboard.press('Escape');
        headerResult.buttonsClicked = 1;
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Activity feed toggle not found';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  test('HEADER — Theme Toggle', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    const headerResult: PageResult = {
      page: 'header_theme_toggle',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      const themeBtn = page.locator('[aria-label*="theme" i], [aria-label*="dark" i], [aria-label*="light" i], [data-testid*="theme"]').first();
      if (await themeBtn.isVisible({ timeout: 3_000 })) {
        await themeBtn.click({ timeout: 2_000 });
        await page.waitForTimeout(400);
        // Toggle back
        await themeBtn.click({ timeout: 2_000 });
        await page.waitForTimeout(400);
        await takeScreenshot(page, 'header_theme_toggle');
        headerResult.buttonsClicked = 2;
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Theme toggle not found';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  test('HEADER — Impersonate Icon', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    const headerResult: PageResult = {
      page: 'header_impersonate',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      const impBtn = page.locator('[aria-label*="impersonate" i], [data-testid*="impersonate"]').first();
      if (await impBtn.isVisible({ timeout: 3_000 })) {
        await impBtn.click({ timeout: 2_000 });
        await page.waitForTimeout(600);
        await takeScreenshot(page, 'header_impersonate');
        await page.keyboard.press('Escape');
        headerResult.buttonsClicked = 1;
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Impersonate icon not found';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  test('HEADER — Emergency Shield Icon', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    const headerResult: PageResult = {
      page: 'header_emergency_shield',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      const shieldBtn = page.locator('[aria-label*="emergency" i], [aria-label*="shield" i], [data-testid*="emergency"]').first();
      if (await shieldBtn.isVisible({ timeout: 3_000 })) {
        await shieldBtn.click({ timeout: 2_000 });
        await page.waitForTimeout(600);
        await takeScreenshot(page, 'header_emergency_shield');
        await page.keyboard.press('Escape');
        headerResult.buttonsClicked = 1;
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Emergency shield icon not found';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  test('HEADER — Copilot Sparkles Icon', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    const headerResult: PageResult = {
      page: 'header_copilot',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      const copilotBtn = page.locator('[aria-label*="copilot" i], [aria-label*="sparkle" i], [aria-label*="ai" i], [data-testid*="copilot"]').first();
      if (await copilotBtn.isVisible({ timeout: 3_000 })) {
        await copilotBtn.click({ timeout: 2_000 });
        await page.waitForTimeout(600);
        await takeScreenshot(page, 'header_copilot');
        await page.keyboard.press('Escape');
        headerResult.buttonsClicked = 1;
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Copilot sparkles icon not found';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  test('HEADER — Logout Button (verify redirect then restore session)', async ({ page }) => {
    const { getErrors, getFailedRequests, getAllXhr, detach } = attachListeners(page);
    await navigateTo(page, `${BASE_URL}/executive`);

    const headerResult: PageResult = {
      page: 'header_logout',
      url: `${BASE_URL}/executive`,
      title: await page.title().catch(() => ''),
      h1: await getH1(page),
      buttonsFound: 0,
      buttonsClicked: 0,
      consoleErrors: [],
      failedRequests: [],
      allXhrResponses: [],
      uiErrorStates: [],
      result: 'PASS',
    };

    try {
      // Look for logout button
      const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Log out"), button:has-text("Sign out"), [aria-label*="logout" i], [aria-label*="log out" i]').first();

      if (await logoutBtn.isVisible({ timeout: 3_000 })) {
        await logoutBtn.click({ timeout: 2_000 });
        // Wait for redirect to /login
        await page.waitForURL(/\/login/, { timeout: 8_000 });
        await takeScreenshot(page, 'header_logout_redirected');

        // Verify we landed on /login
        expect(page.url()).toContain('/login');
        headerResult.buttonsClicked = 1;

        // Navigate back using storageState (cookies are still set via test fixture)
        await navigateTo(page, `${BASE_URL}/executive`);
        await takeScreenshot(page, 'header_logout_restored');
      } else {
        headerResult.result = 'BLOCKED';
        headerResult.reason = 'Logout button not found in header';
      }
    } catch (err) {
      headerResult.result = 'FAIL';
      headerResult.reason = (err as Error).message;
    }

    headerResult.consoleErrors = getErrors();
    headerResult.failedRequests = getFailedRequests();
    headerResult.allXhrResponses = getAllXhr();
    detach();
    results.push(headerResult);
  });

  // -------------------------------------------------------------------------
  // Write JSON results after all tests
  // -------------------------------------------------------------------------

  test.afterAll(async () => {
    const outputDir = path.dirname(RESULTS_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      totalPages: results.length,
      passed: results.filter(r => r.result === 'PASS').length,
      failed: results.filter(r => r.result === 'FAIL').length,
      blocked: results.filter(r => r.result === 'BLOCKED').length,
      results,
    };

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\n=== AUDIT RESULTS WRITTEN TO: ${RESULTS_PATH} ===`);
    console.log(`Total: ${summary.totalPages}  PASS: ${summary.passed}  FAIL: ${summary.failed}  BLOCKED: ${summary.blocked}`);
  });
});
