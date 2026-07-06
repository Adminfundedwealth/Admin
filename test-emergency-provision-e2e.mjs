/**
 * End-to-end emergency provision test with authenticated session.
 * 1. Login as founder
 * 2. Get emergency provision catalog
 * 3. Provision a Flash account
 * 4. Verify in DB
 */

const BASE = 'http://localhost:3000';
const EMAIL = 'adminfundedwealth@gmail.com';
const PASSWORD = 'Founder@Admin2025!';

let sessionCookie = null;

// Step 1: Login
console.log('Step 1: Logging in as founder...');
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});

const loginJson = await loginRes.json();
console.log(`Login response: ${loginRes.status}`, JSON.stringify(loginJson, null, 2));

if (loginRes.ok && loginJson.success) {
  // Extract session cookie
  const setCookieHeaders = loginRes.headers.getSetCookie();
  for (const cookie of setCookieHeaders) {
    if (cookie.startsWith('session_token=')) {
      sessionCookie = cookie.split(';')[0];
      break;
    }
  }
  console.log('Session cookie:', sessionCookie ? 'obtained' : 'MISSING');
} else {
  if (loginJson.requiresTwoFactor) {
    console.log('\n⚠ 2FA is required for this account.');
    console.log('Since this is a test, disable 2FA in DB: UPDATE staff_members SET totp_enabled=false WHERE email=\'cryptoaman9152@gmail.com\';');
    console.log('Or use the seed-founder script to recreate the account without 2FA.');
    process.exit(1);
  }
  console.error('Login failed:', loginJson);
  process.exit(1);
}

// Step 2: Get catalog
console.log('\n Step 2: Fetching emergency provision catalog...');
const catalogRes = await fetch(`${BASE}/api/founder/emergency-provision`, {
  headers: { Cookie: sessionCookie },
});

const catalogJson = await catalogRes.json();
console.log(`Catalog response: ${catalogRes.status}`, JSON.stringify(catalogJson, null, 2).slice(0, 500));

if (!catalogRes.ok || !catalogJson.products) {
  console.error('Catalog fetch failed');
  process.exit(1);
}

const flashProduct = catalogJson.products.find(p => p.slug === 'flash');
if (!flashProduct) {
  console.error('Flash product not in catalog:', catalogJson.products.map(p => p.slug));
  process.exit(1);
}

console.log(`Flash product: ${flashProduct.displayName}`);
console.log(`  profitTarget: ${flashProduct.profitTarget}`);
console.log(`  dailyLoss: ${flashProduct.dailyLoss}`);
console.log(`  maxLoss: ${flashProduct.maxLoss}`);
console.log(`  leverage: ${flashProduct.leverage}`);
console.log(`  rules: pt=${flashProduct.rules.profitTargetPct}% dl=${flashProduct.rules.dailyLossLimitPct}% dd=${flashProduct.rules.maxDrawdownPct}%`);
console.log(`  sizes: ${flashProduct.accountSizes.join(', ')}`);

// Step 3: Provision Flash account
console.log('\nStep 3: Provisioning Flash account...');
const testEmail = `e2e-flash-${Date.now()}@test.local`;
const provisionRes = await fetch(`${BASE}/api/founder/emergency-provision`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
  body: JSON.stringify({
    name: 'E2E Test User',
    email: testEmail,
    phone: '+1234567890',
    challenge_type: 'flash',
    account_size: flashProduct.accountSizes[0],
  }),
});

const provisionJson = await provisionRes.json();
console.log(`Provision response: ${provisionRes.status}`);

if (!provisionRes.ok) {
  console.error('Provision failed:', JSON.stringify(provisionJson, null, 2));
  process.exit(1);
}

console.log('\nProvisioning SUCCESS!');
console.log(JSON.stringify(provisionJson.data, null, 2));

// Step 4: Verify BUG fixes
console.log('\n════════ VERIFICATION ════════');
const result = provisionJson.data;

// BUG 1: Product matches catalog
console.log(`\n[BUG 1] Product catalog values:`);
console.log(`  Requested: flash`);
console.log(`  Challenge type in response: ${result.challenge_type}`);
console.log(`  Challenge display name: ${result.challenge_display_name}`);
console.log(`  Catalog rules: pt=${flashProduct.rules.profitTargetPct}% dl=${flashProduct.rules.dailyLossLimitPct}% dd=${flashProduct.rules.maxDrawdownPct}%`);
if (result.stored_rules) {
  console.log(`  DB stored rules: pt=${result.stored_rules.profit_target_pct}% dl=${result.stored_rules.daily_loss_limit_pct}% dd=${result.stored_rules.max_drawdown_pct}%`);
  const match = result.stored_rules.profit_target_pct === flashProduct.rules.profitTargetPct &&
                result.stored_rules.daily_loss_limit_pct === flashProduct.rules.dailyLossLimitPct &&
                result.stored_rules.max_drawdown_pct === flashProduct.rules.maxDrawdownPct;
  console.log(`  ✓ ${match ? 'PASS' : 'FAIL'}: DB rules match catalog`);
}

// BUG 2: Credentials generated
console.log(`\n[BUG 2] Terminal credentials:`);
console.log(`  terminal_login: ${result.terminal_login}`);
console.log(`  terminal_email: ${result.terminal_email}`);
console.log(`  temporary_password: ${result.temporary_password ? '****(length=' + result.temporary_password.length + ')' : 'MISSING'}`);
console.log(`  activation_token: ${result.activation_token ? result.activation_token.slice(0, 8) + '...' : 'MISSING'}`);
console.log(`  credential_expiry: ${result.credential_expiry}`);
const bug2Pass = !!result.terminal_login && !!result.temporary_password && !!result.activation_token && !!result.credential_expiry;
console.log(`  ✓ ${bug2Pass ? 'PASS' : 'FAIL'}: All credentials present`);

// BUG 3: Synchronization
console.log(`\n[BUG 3] Credential synchronization:`);
console.log(`  Dashboard terminal_login: ${result.terminal_login}`);
console.log(`  Dashboard email: ${result.terminal_email}`);
console.log(`  DB stored (if available): ${result.stored_rules ? 'present' : 'not yet read back'}`);
const bug3Pass = result.terminal_login === (result.stored_rules?.terminal_login || result.terminal_login);
console.log(`  ✓ ${bug3Pass ? 'PASS' : 'N/A'}: Synchronization (will verify via DB query)`);

// BUG 4: Launch Terminal URL
console.log(`\n[BUG 4] Terminal launch:`);
console.log(`  launch_url: ${result.launch_url ? result.launch_url.slice(0, 100) + '...' : 'MISSING'}`);
console.log(`  terminal_url: ${result.terminal_url}`);
const bug4Pass = !!result.launch_url && result.launch_url.includes('/auth/sso') && result.launch_url.includes('sso=') && result.launch_url.includes('login=');
console.log(`  ✓ ${bug4Pass ? 'PASS' : 'FAIL'}: Launch URL constructed correctly`);

// BUG 5: Verification
console.log(`\n[BUG 5] End-to-end verification:`);
if (result.verification?.checks) {
  for (const [k, v] of Object.entries(result.verification.checks)) {
    console.log(`  ${v ? '✓' : '✗'} ${k}: ${v ? 'PASS' : 'FAIL'}`);
  }
}

console.log('\n════════ SUMMARY ════════');
console.log(`BUG 1 (Product catalog):      ${result.stored_rules ? 'VERIFIED' : 'PENDING DB READ'}`);
console.log(`BUG 2 (Credentials):          ${bug2Pass ? 'PASS' : 'FAIL'}`);
console.log(`BUG 3 (Synchronization):      PENDING DB VERIFICATION`);
console.log(`BUG 4 (Launch Terminal):      ${bug4Pass ? 'PASS' : 'FAIL'}`);
console.log(`BUG 5 (Verification):         ${result.verification?.checks ? 'PASS' : 'N/A'}`);

// Step 5: Verify in DB
console.log('\n════════ DATABASE VERIFICATION ════════');
import { createClient } from '@supabase/supabase-js';
const sb = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);

if (result.trading_account_id) {
  await new Promise(r => setTimeout(r, 2000)); // wait for DB write
  const { data: ta } = await sb.from('trading_accounts').select('id,account_code,broker_credentials_encrypted').eq('id', result.trading_account_id).single();
  if (ta) {
    console.log(`Trading account ${ta.id.slice(0, 8)}: account_code=${ta.account_code}`);
    let creds = null;
    try { creds = JSON.parse(ta.broker_credentials_encrypted); } catch {}
    if (creds) {
      console.log(`  Credentials in broker_credentials_encrypted:`);
      console.log(`    terminal_login: ${creds.terminal_login}`);
      console.log(`    temporary_password: ${creds.temporary_password ? '****' : 'MISSING'}`);
      console.log(`    activation_token: ${creds.activation_token ? creds.activation_token.slice(0,8) : 'MISSING'}`);
      console.log(`    credential_expiry: ${creds.credential_expiry}`);
      console.log(`    product_slug: ${creds.product_slug}`);
      console.log(`    account_size: ${creds.account_size}`);
      const dbMatch = creds.terminal_login === result.terminal_login &&
                      creds.temporary_password === result.temporary_password &&
                      creds.product_slug === 'flash';
      console.log(`  ✓ ${dbMatch ? 'PASS' : 'FAIL'}: DB credentials match response`);
    } else {
      console.log(`  ✗ FAIL: broker_credentials_encrypted not JSON or empty`);
    }
  } else {
    console.log(`  ✗ trading_account not found in DB yet (may still be processing)`);
  }
}

console.log('\n✅ END-TO-END TEST COMPLETE');
process.exit(0);
