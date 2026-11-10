import { test as setup, chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR =
  'C:\\Users\\rmsam\\fundedwealth\\.agents\\tasks\\admin-os-audit\\screenshots';
const AUTH_STATE_PATH =
  'C:\\Users\\rmsam\\fundedwealth\\admin-os\\tests\\e2e\\.auth\\founder.json';

/** Parse a .env-style file and return a key→value map (no console.log of values). */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    // Strip surrounding quotes from value
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** Resolve credentials: check process.env first, then .env.local.backup file. */
function resolveCredentials(): { email: string; password: string } | null {
  // Candidate field names for email
  const emailKeys = [
    'ADMIN_EMAIL',
    'ADMIN_TEST_EMAIL',
    'TEST_EMAIL',
    'PLAYWRIGHT_EMAIL',
  ];
  // Candidate field names for password
  const passwordKeys = [
    'ADMIN_PASSWORD',
    'ADMIN_TEST_PASSWORD',
    'TEST_PASSWORD',
    'PLAYWRIGHT_PASSWORD',
  ];

  // Try process.env first
  let email: string | undefined;
  let password: string | undefined;
  for (const k of emailKeys) {
    if (process.env[k]) { email = process.env[k]; break; }
  }
  for (const k of passwordKeys) {
    if (process.env[k]) { password = process.env[k]; break; }
  }

  if (email && password) {
    // Log only which keys were found, not their values
    console.log('[auth.setup] Credentials loaded from process.env');
    return { email, password };
  }

  // Fall back to .env.local.backup
  const envFilePath = path.join(
    'C:\\Users\\rmsam\\fundedwealth\\admin-os',
    '.env.local.backup'
  );
  const envVars = parseEnvFile(envFilePath);

  const foundEmailKeys = emailKeys.filter((k) => k in envVars);
  const foundPasswordKeys = passwordKeys.filter((k) => k in envVars);

  if (foundEmailKeys.length === 0 || foundPasswordKeys.length === 0) {
    // Also scan for any _EMAIL / _PASSWORD pairs not in the candidate list
    const allEmailKeys = Object.keys(envVars).filter((k) => k.endsWith('_EMAIL'));
    const allPasswordKeys = Object.keys(envVars).filter((k) => k.endsWith('_PASSWORD'));

    if (allEmailKeys.length > 0 && allPasswordKeys.length > 0) {
      console.log(
        `[auth.setup] Found credential keys in .env.local.backup: email=${allEmailKeys[0]}, password=${allPasswordKeys[0]}`
      );
      return { email: envVars[allEmailKeys[0]], password: envVars[allPasswordKeys[0]] };
    }

    console.log(
      '[auth.setup] No credential keys found. Checked:',
      [...emailKeys, ...passwordKeys].join(', ')
    );
    return null;
  }

  console.log(
    `[auth.setup] Found credential keys in .env.local.backup: email=${foundEmailKeys[0]}, password=${foundPasswordKeys[0]}`
  );
  return { email: envVars[foundEmailKeys[0]], password: envVars[foundPasswordKeys[0]] };
}

setup('authenticate as admin', async () => {
  const creds = resolveCredentials();

  if (!creds) {
    throw new Error(
      'No test credentials found in .env.local.backup. ' +
        'Please provide ADMIN_TEST_EMAIL and ADMIN_TEST_PASSWORD in that file.'
    );
  }

  // Ensure screenshots directory exists
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  // Launch a fresh chromium — do NOT use the Brave user profile (may be locked)
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('https://admin.fundedwealth.com/login');

    // Fill email — try multiple selectors
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      '#email',
    ];
    let emailFilled = false;
    for (const sel of emailSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.fill(creds.email);
        emailFilled = true;
        break;
      }
    }
    if (!emailFilled) {
      throw new Error('Could not find email input on login page');
    }

    // Fill password — try multiple selectors
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      '#password',
    ];
    let passwordFilled = false;
    for (const sel of passwordSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
        await el.fill(creds.password);
        passwordFilled = true;
        break;
      }
    }
    if (!passwordFilled) {
      throw new Error('Could not find password input on login page');
    }

    // Click submit button
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      'button:has-text("Log in")',
    ];
    let submitted = false;
    for (const sel of submitSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click();
        submitted = true;
        break;
      }
    }
    if (!submitted) {
      throw new Error('Could not find submit button on login page');
    }

    // Wait up to 10 s for navigation away from /login
    await page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 })
      .catch(async () => {
        // Check if 2FA input appeared before giving up
        const twoFaSelectors = [
          'input[name="otp"]',
          'input[name="code"]',
          'input[placeholder*="code"]',
        ];
        for (const sel of twoFaSelectors) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
            await page.screenshot({
              path: path.join(SCREENSHOTS_DIR, '2fa-prompt.png'),
            });
            throw new Error('2FA required — provide OTP manually');
          }
        }
        // No 2FA — still on /login, treat as auth failure
        throw new Error('Navigation away from /login timed out after 10 s');
      });

    // Also check for 2FA after navigation (some apps redirect to a 2FA page)
    const twoFaSelectorsPost = [
      'input[name="otp"]',
      'input[name="code"]',
      'input[placeholder*="code"]',
    ];
    for (const sel of twoFaSelectorsPost) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, '2fa-prompt.png'),
        });
        throw new Error('2FA required — provide OTP manually');
      }
    }

    // Save storage state
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log('[auth.setup] Auth state saved to', AUTH_STATE_PATH);
  } catch (err) {
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'auth-failure.png'),
    }).catch(() => {/* ignore screenshot errors */});
    throw err;
  } finally {
    await browser.close();
  }
});
