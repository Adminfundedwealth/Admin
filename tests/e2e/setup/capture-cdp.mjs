/**
 * capture-cdp.mjs
 *
 * Connects to a running Brave browser via CDP (port 9223) and captures
 * the Supabase auth token from localStorage on admin.fundedwealth.com.
 *
 * If Brave is NOT already running with --remote-debugging-port=9223, this
 * script launches a new Brave window with a fresh temp profile.
 *
 * Usage: node tests/e2e/setup/capture-cdp.mjs
 *
 * Run from: C:\Users\rmsam\fundedwealth\admin-os
 *
 * Supabase project ref: nysrxvpjdlvzvcawysvh
 */

import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';

const BRAVE_EXE =
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const DEBUG_PORT = 9223;
const ADMIN_URL = 'https://admin.fundedwealth.com';
const SUPABASE_REF = 'nysrxvpjdlvzvcawysvh';
const AUTH_STATE_PATH = path.resolve('tests/e2e/.auth/founder.json');

/** Wait for a prompt and read a line from stdin */
function waitForEnter(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

/** Check if CDP is already reachable on the given port */
async function isCDPAlreadyRunning(port) {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Wait for CDP to become available */
async function waitForCDP(port, retries = 20, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    if (await isCDPAlreadyRunning(port)) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `CDP on port ${port} did not start after ${(retries * delayMs) / 1000}s`
  );
}

async function main() {
  console.log('');
  console.log('=== Admin OS — Playwright Auth Capture via CDP ===');
  console.log('');

  let launchedBrave = false;
  let tmpProfile = null;

  const alreadyRunning = await isCDPAlreadyRunning(DEBUG_PORT);

  if (alreadyRunning) {
    console.log(
      `CDP already active on port ${DEBUG_PORT} — connecting to existing Brave session.`
    );
    console.log('');

    // List currently open pages to help user navigate
    try {
      const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
      const pages = await listRes.json();
      const adminPages = pages.filter((p) =>
        p.url?.includes('fundedwealth.com')
      );
      if (adminPages.length > 0) {
        console.log('Found admin.fundedwealth.com tabs:');
        adminPages.forEach((p) => console.log(' -', p.url?.slice(0, 100)));
      } else {
        console.log(
          'No admin.fundedwealth.com tabs found in the existing session.'
        );
        console.log(
          `Please navigate to ${ADMIN_URL} in your Brave window, then come back.`
        );
      }
    } catch {
      // ignore
    }
  } else {
    console.log('No CDP session found — launching a new Brave window with remote debugging.');
    tmpProfile = path.join(
      process.env.TEMP || 'C:\\Temp',
      `brave-pw-${Date.now()}`
    );

    const braveProc = spawn(
      BRAVE_EXE,
      [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${tmpProfile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        ADMIN_URL,
      ],
      { detached: true, stdio: 'ignore' }
    );
    braveProc.unref();
    launchedBrave = true;

    console.log('Waiting for Brave to start...');
    await waitForCDP(DEBUG_PORT);
    console.log('Brave is ready.');
    console.log('');
    console.log(
      '>>> A new Brave window opened at admin.fundedwealth.com <<<'
    );
    console.log(
      '>>> Please LOG IN with your admin credentials in that window. <<<'
    );
  }

  console.log('');
  console.log('Once you see the Admin OS DASHBOARD (not the login page),');
  console.log('press ENTER here to capture the session.');
  console.log('');
  await waitForEnter('Press ENTER after logging in > ');

  console.log('');
  console.log('Connecting to Brave via CDP...');

  let browser;
  try {
    browser = await chromium.connectOverCDP(
      `http://localhost:${DEBUG_PORT}`,
      { timeout: 15_000 }
    );
  } catch (e) {
    console.error('Could not connect to Brave CDP:', e.message);
    process.exit(1);
  }

  const contexts = browser.contexts();
  console.log(`Connected. ${contexts.length} context(s) found.`);

  let captured = false;

  for (const ctx of contexts) {
    if (captured) break;
    for (const page of ctx.pages()) {
      const url = page.url();
      if (!url.includes('fundedwealth.com')) continue;

      console.log('Inspecting page:', url.slice(0, 100));

      // If still on login page, skip
      if (/\/login|\/2fa/i.test(url)) {
        console.log('  → Still on login/2FA page, skipping.');
        continue;
      }

      try {
        const lsEntries = await page.evaluate(() => {
          const out = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k) out.push({ name: k, value: localStorage.getItem(k) || '' });
          }
          return out;
        });

        const sbEntries = lsEntries.filter((e) => e.name.startsWith('sb-'));
        console.log(
          '  Supabase localStorage keys:',
          sbEntries.map((e) => e.name).join(', ') || '(none)'
        );

        if (sbEntries.length === 0) {
          console.log('  → No Supabase keys — not authenticated yet?');
          continue;
        }

        // Validate that the auth token entry contains an access_token
        const tokenEntry = sbEntries.find((e) =>
          e.name.includes('-auth-token')
        );
        if (tokenEntry) {
          try {
            const parsed = JSON.parse(tokenEntry.value);
            if (!parsed.access_token) {
              console.log('  → access_token missing in auth token entry.');
              continue;
            }
            console.log('  ✓ Authenticated session found!');
            if (parsed.user?.email) {
              console.log('    User email key present (value hidden)');
            }
            if (parsed.expires_at) {
              console.log(
                '    Expires:',
                new Date(parsed.expires_at * 1000).toISOString()
              );
            }
          } catch {
            console.log('  → Could not parse auth token JSON.');
            continue;
          }
        }

        // Build storage state with ALL localStorage entries (not just sb-)
        const storageState = {
          cookies: [],
          origins: [
            {
              origin: 'https://admin.fundedwealth.com',
              localStorage: lsEntries,
            },
          ],
        };

        fs.mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
        fs.writeFileSync(
          AUTH_STATE_PATH,
          JSON.stringify(storageState, null, 2),
          'utf-8'
        );

        console.log('');
        console.log('✓ Storage state saved to:', AUTH_STATE_PATH);
        console.log(
          `  Captured ${lsEntries.length} total localStorage entries (${sbEntries.length} Supabase).`
        );
        captured = true;
        break;
      } catch (e) {
        console.error('  Error reading localStorage:', e.message);
      }
    }
  }

  // Disconnect CDP — do NOT kill Brave
  await browser.close().catch(() => {});
  console.log('CDP connection closed. Brave window remains open.');

  // Clean up temp profile directory if we created one
  if (tmpProfile) {
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  if (!captured) {
    console.error('');
    console.error(
      '✗ Could not capture session. Possible reasons:'
    );
    console.error(
      '  1. The page was still on /login when you pressed ENTER.'
    );
    console.error(
      '  2. No fundedwealth.com tabs were open in this Brave session.'
    );
    console.error('');
    console.error('Try again, or use Method 2 (password login):');
    console.error(
      '  Add ADMIN_EMAIL and ADMIN_PASSWORD to .env.local.backup, then run:'
    );
    console.error(
      '  npx playwright test tests/e2e/setup/auth.setup.ts --project=chromium'
    );
    process.exit(1);
  }

  console.log('');
  console.log('All done. Run the audit with:');
  console.log(
    '  npx playwright test tests/e2e/full-audit.spec.ts --project=chromium --config=playwright.config.ts'
  );
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
