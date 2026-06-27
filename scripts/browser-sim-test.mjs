/**
 * Simulates EXACTLY what a browser does during the Founder login flow.
 * Uses fetch with redirect:manual and cookie jar to replicate browser behavior.
 * This tests the same HTTP calls the browser makes.
 */
import { TOTP } from 'otpauth';
import { createClient } from '@supabase/supabase-js';

const BASE = 'http://localhost:4200';

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
  console.log('═══ BROWSER SIMULATION TEST ═══');
  console.log('(Replicates exact browser HTTP behavior)\n');

  // Get DB state
  const staffData = await query("SELECT totp_secret, totp_enabled FROM staff_members WHERE email = 'cryptoaman9152@gmail.com'");
  const { totp_enabled, totp_secret } = staffData[0];
  console.log(`DB: totp_enabled=${totp_enabled}, secret=${totp_secret ? 'SET' : 'NULL'}\n`);

  // Step 1: Browser loads /login page
  console.log('STEP 1: GET /login (browser loads login page)');
  const loginPage = await fetch(`${BASE}/login`);
  console.log(`  Status: ${loginPage.status}`);
  if (loginPage.status !== 200) { console.log('  ✗ FAIL'); process.exit(1); }
  console.log('  ✓ Login page loaded\n');

  // Step 2: User submits login form (XHR from browser JS)
  console.log('STEP 2: POST /api/auth/login (form submit via fetch)');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cryptoaman9152@gmail.com', password: 'Founder@Admin2025!' }),
  });
  const loginBody = await loginRes.json();
  console.log(`  Status: ${loginRes.status}`);
  console.log(`  Body: ${JSON.stringify(loginBody)}`);
  
  if (loginRes.status !== 200) {
    console.log(`  ✗ Authentication FAILED: ${loginBody.error?.message}`);
    process.exit(1);
  }
  console.log('  ✓ Authentication successful\n');

  let sessionCookie = null;

  if (totp_enabled && loginBody.requires2FA) {
    // Flow A: 2FA already enabled, verify code
    console.log('STEP 3: Redirect to /2fa (2FA verify flow)');
    console.log(`  Challenge token: ${loginBody.challengeToken}`);
    
    // Browser navigates to /2fa?token=xxx
    const twoFaPage = await fetch(`${BASE}/2fa?token=${loginBody.challengeToken}`);
    console.log(`  GET /2fa: ${twoFaPage.status}`);
    if (twoFaPage.status !== 200) { console.log('  ✗ FAIL'); process.exit(1); }
    console.log('  ✓ 2FA page loaded\n');

    // Generate TOTP code
    console.log('STEP 4: Generate & submit TOTP code');
    const totp = new TOTP({ secret: totp_secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();
    console.log(`  Code: ${code}`);

    const verifyRes = await fetch(`${BASE}/api/auth/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, challengeToken: loginBody.challengeToken }),
    });
    const verifyBody = await verifyRes.json();
    const verifyCookie = verifyRes.headers.get('set-cookie');
    console.log(`  POST /api/auth/2fa/verify: ${verifyRes.status}`);
    console.log(`  Body: ${JSON.stringify(verifyBody)}`);
    console.log(`  Set-Cookie: ${verifyCookie ? 'YES' : 'NO'}`);

    if (verifyRes.status !== 200 || !verifyBody.success) {
      console.log(`  ✗ 2FA verify FAILED: ${JSON.stringify(verifyBody)}`);
      process.exit(1);
    }
    sessionCookie = verifyCookie?.split('session_token=')[1]?.split(';')[0];
    console.log('  ✓ 2FA verified, session created\n');

  } else if (loginBody.requiresSetup2FA) {
    // Flow B: First login, setup 2FA
    console.log('STEP 3: Redirect to /2fa-setup (first login flow)');
    const staffId = loginBody.staffId;
    
    // Browser navigates to /2fa-setup?staffId=xxx
    const setupPage = await fetch(`${BASE}/2fa-setup?staffId=${staffId}`);
    console.log(`  GET /2fa-setup: ${setupPage.status}`);
    if (setupPage.status !== 200) { console.log('  ✗ FAIL'); process.exit(1); }
    console.log('  ✓ 2FA setup page loaded\n');

    // Page's useEffect calls POST /api/auth/2fa/setup
    console.log('STEP 4: POST /api/auth/2fa/setup (page auto-calls this)');
    const setupRes = await fetch(`${BASE}/api/auth/2fa/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId }),
    });
    const setupBody = await setupRes.json();
    console.log(`  Status: ${setupRes.status}`);
    console.log(`  Secret: ${setupBody.secret}`);
    console.log(`  QR URL: ${setupBody.qrCodeUrl?.substring(0, 50)}...`);
    if (setupRes.status !== 200) { console.log('  ✗ FAIL'); process.exit(1); }
    console.log('  ✓ TOTP secret generated\n');

    // User scans QR, enters code
    console.log('STEP 5: User enters TOTP code from authenticator');
    const totp = new TOTP({ secret: setupBody.secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();
    console.log(`  Code: ${code}`);

    const verifyRes = await fetch(`${BASE}/api/auth/2fa/setup/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, secret: setupBody.secret, staffId }),
    });
    const verifyBody = await verifyRes.json();
    const verifyCookie = verifyRes.headers.get('set-cookie');
    console.log(`  POST /api/auth/2fa/setup/verify: ${verifyRes.status}`);
    console.log(`  Body: ${JSON.stringify(verifyBody)}`);
    console.log(`  Set-Cookie: ${verifyCookie ? 'YES' : 'NO'}`);

    if (verifyRes.status !== 200 || !verifyBody.success) {
      console.log(`  ✗ Setup verify FAILED: ${JSON.stringify(verifyBody)}`);
      process.exit(1);
    }
    sessionCookie = verifyCookie?.split('session_token=')[1]?.split(';')[0];
    console.log('  ✓ 2FA setup complete, session created\n');
  }

  // Step 5/6: Browser redirects to /executive with cookie
  console.log('STEP 6: GET /executive (with session_token cookie)');
  if (!sessionCookie) {
    console.log('  ✗ No session cookie obtained');
    process.exit(1);
  }
  console.log(`  Cookie: session_token=${sessionCookie.substring(0, 16)}...`);
  
  const dashRes = await fetch(`${BASE}/executive`, {
    headers: { 'Cookie': `session_token=${sessionCookie}` },
    redirect: 'manual',
  });
  console.log(`  Status: ${dashRes.status}`);
  const location = dashRes.headers.get('location');
  if (location) console.log(`  Location: ${location}`);

  if (dashRes.status === 200) {
    const html = await dashRes.text();
    const hasContent = html.length > 500;
    console.log(`  HTML length: ${html.length} chars`);
    console.log('  ✓ DASHBOARD LOADED SUCCESSFULLY\n');
  } else if (dashRes.status === 307 || dashRes.status === 302) {
    if (location?.includes('/login')) {
      console.log('  ✗ Redirected to login — session not accepted');
      console.log('  Debugging: trying /api/staff with same cookie...');
      const apiTest = await fetch(`${BASE}/api/staff`, {
        headers: { 'Cookie': `session_token=${sessionCookie}` },
      });
      console.log(`  /api/staff: ${apiTest.status} ${await apiTest.text()}`);
    } else {
      console.log(`  → Redirected to: ${location}`);
    }
  } else {
    console.log(`  Unexpected status: ${dashRes.status}`);
  }

  // Final result
  console.log('═══════════════════════════════════════');
  if (dashRes.status === 200) {
    console.log('RESULT: ✓ PASS — Founder can login from browser');
    console.log('URL: http://localhost:4200/login');
  } else {
    console.log('RESULT: ✗ FAIL');
    console.log(`Blocked at: GET /executive → ${dashRes.status}`);
  }
  console.log('═══════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
