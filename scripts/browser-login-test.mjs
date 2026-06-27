/**
 * Simulates a real browser login flow using Playwright.
 * This opens an actual browser, fills in the form, and traces every step.
 */
import { chromium } from '@playwright/test';
import { TOTP } from 'otpauth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function query(sql) {
  const { data, error } = await supabase.rpc('query_sql', { sql_query: sql });
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  console.log('═══ BROWSER LOGIN TEST ═══\n');

  // Get current TOTP secret from DB (2FA is already enabled)
  const staffData = await query("SELECT totp_secret, totp_enabled FROM staff_members WHERE email = 'cryptoaman9152@gmail.com'");
  const totpSecret = staffData?.[0]?.totp_secret;
  const totpEnabled = staffData?.[0]?.totp_enabled;
  console.log(`DB State: totp_enabled=${totpEnabled}, secret=${totpSecret ? 'SET' : 'NULL'}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture network requests
  const requests = [];
  page.on('request', req => {
    if (req.url().includes('/api/')) {
      requests.push({ method: req.method(), url: req.url(), body: req.postData() });
    }
  });

  const responses = [];
  page.on('response', async res => {
    if (res.url().includes('/api/')) {
      let body = '';
      try { body = await res.text(); } catch {}
      responses.push({ url: res.url(), status: res.status(), body });
    }
  });

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    // Step 1: Navigate to login
    console.log('1. Navigate to http://localhost:4200/login');
    await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`   URL: ${page.url()}`);
    console.log(`   ✓ Login page loaded`);

    // Step 2: Fill form and submit
    console.log('\n2. Fill login form');
    await page.fill('input[type="email"]', 'cryptoaman9152@gmail.com');
    await page.fill('input[type="password"]', 'Founder@Admin2025!');
    console.log('   ✓ Credentials entered');

    console.log('\n3. Submit form');
    await page.click('button[type="submit"]');
    
    // Wait for navigation or response
    await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const postLoginUrl = page.url();
    console.log(`   URL after submit: ${postLoginUrl}`);

    // Print API responses
    console.log('\n─── Network Log ───');
    for (const r of responses) {
      console.log(`   ${r.status} ${r.url.replace('http://localhost:4200', '')}`);
      console.log(`       ${r.body.substring(0, 150)}`);
    }

    // Step 4: Handle 2FA
    if (postLoginUrl.includes('/2fa-setup')) {
      console.log('\n4. On 2FA Setup page');
      // Wait for setup API call
      await page.waitForTimeout(3000);
      
      // Check for errors on page
      const errorEl = await page.$('[role="alert"]');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        console.log(`   ✗ Error on page: "${errorText}"`);
      }

      // Get the secret displayed on page
      const secretEl = await page.$('code');
      const displayedSecret = secretEl ? await secretEl.textContent() : null;
      console.log(`   Displayed secret: ${displayedSecret || 'NOT SHOWN'}`);

      if (displayedSecret) {
        // Click "I've Scanned the Code"
        await page.click('button:has-text("Scanned")');
        await page.waitForTimeout(500);
        console.log('   ✓ Clicked "I\'ve Scanned the Code"');

        // Generate TOTP code
        const totp = new TOTP({ secret: displayedSecret.trim(), algorithm: 'SHA1', digits: 6, period: 30 });
        const code = totp.generate();
        console.log(`   Generated TOTP: ${code}`);

        // Enter code
        await page.fill('input[id="verify-code"]', code);
        await page.click('button[type="submit"]');
        console.log('   ✓ Submitted verification code');

        await page.waitForURL(url => !url.toString().includes('/2fa'), { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }

    } else if (postLoginUrl.includes('/2fa') && !postLoginUrl.includes('setup')) {
      console.log('\n4. On 2FA Verify page');
      
      if (!totpSecret) {
        console.log('   ✗ Cannot generate code - no TOTP secret in DB');
      } else {
        // Wait for page to load
        await page.waitForTimeout(1000);

        // Generate code
        const totp = new TOTP({ secret: totpSecret, algorithm: 'SHA1', digits: 6, period: 30 });
        const code = totp.generate();
        console.log(`   Generated TOTP: ${code}`);

        // Enter code
        const codeInput = await page.$('input[type="text"]');
        if (codeInput) {
          await codeInput.fill(code);
          await page.click('button[type="submit"]');
          console.log('   ✓ Submitted verification code');
          
          await page.waitForURL(url => !url.toString().includes('/2fa'), { timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(2000);
        } else {
          console.log('   ✗ Could not find code input');
        }
      }
    }

    // Step 5: Check final state
    const finalUrl = page.url();
    console.log(`\n5. Final URL: ${finalUrl}`);

    // Check cookies
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(c => c.name === 'session_token');
    console.log(`   session_token cookie: ${sessionCookie ? '✓ SET' : '✗ NOT SET'}`);

    // Check if on dashboard
    if (finalUrl.includes('/executive')) {
      console.log('   ✓ DASHBOARD REACHED');
    } else if (finalUrl.includes('/login')) {
      console.log('   ✗ Still on login page');
      const errorEl = await page.$('[role="alert"]');
      if (errorEl) {
        const errorText = await errorEl.textContent();
        console.log(`   Error: "${errorText}"`);
      }
    } else {
      console.log(`   ? Unexpected URL: ${finalUrl}`);
      // Try to get page content
      const bodyText = await page.textContent('body').catch(() => '');
      console.log(`   Page text: ${bodyText.substring(0, 200)}`);
    }

    // Print any additional API responses
    if (responses.length > 1) {
      console.log('\n─── All API Responses ───');
      for (const r of responses) {
        console.log(`   ${r.status} ${r.url.replace('http://localhost:4200', '')} → ${r.body.substring(0, 100)}`);
      }
    }

    // Console errors
    if (consoleErrors.length > 0) {
      console.log('\n─── Console Errors ───');
      consoleErrors.forEach(e => console.log(`   ${e}`));
    }

    console.log('\n═══════════════════════════');
    if (finalUrl.includes('/executive') && sessionCookie) {
      console.log('RESULT: ✓ PASS');
    } else {
      console.log('RESULT: ✗ FAIL');
    }
    console.log('═══════════════════════════');

  } catch (err) {
    console.error('\nFATAL ERROR:', err.message);
    console.log(`Current URL: ${page.url()}`);
    if (consoleErrors.length) {
      console.log('Console errors:', consoleErrors);
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
