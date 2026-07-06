/**
 * Test terminal-launch API with CSRF token.
 */
import { randomBytes, createHmac } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const BASE = 'http://localhost:3000';
const SESSION_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

// Generate valid CSRF token
function makeCSRF() {
  const payload = randomBytes(32).toString('hex');
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

// Step 1: Login
console.log('Logging in...');
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'adminfundedwealth@gmail.com', password: 'Founder@Admin2025!' }),
});
const loginJson = await loginRes.json();
console.log(`Login: ${loginRes.status}`, loginJson.success ? 'ok' : loginJson);
if (!loginJson.success) process.exit(1);

const cookies = loginRes.headers.getSetCookie();
const sessionCookie = cookies.find(c => c.startsWith('session_token='))?.split(';')[0];
if (!sessionCookie) { console.log('No session cookie'); process.exit(1); }

const csrf = makeCSRF();
const fullCookies = `${sessionCookie}; __csrf_token=${csrf}`;

// Step 2: Get a trading account ID from DB
const sb = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);
const { data: ta } = await sb.from('trading_accounts').select('id, account_code').limit(1).single();
console.log(`Testing with: id=${ta?.id?.slice(0,8)} code=${ta?.account_code}`);

// Step 3: Call terminal-launch
console.log('\nCalling terminal-launch...');
const launchRes = await fetch(`${BASE}/api/founder/terminal-launch`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Cookie: fullCookies,
    'x-csrf-token': csrf,
  },
  body: JSON.stringify({
    trading_account_id: ta?.id,
    email: 'test@fundedwealth.com',
    terminal_login: ta?.account_code,
  }),
});

const launchJson = await launchRes.json();
console.log(`terminal-launch: HTTP ${launchRes.status}`);
console.log(JSON.stringify(launchJson, null, 2));

if (launchRes.ok) {
  console.log('\n✓ PASS: terminal-launch returned HTTP 200');
  console.log(`✓ launch_url: ${launchJson.launch_url?.slice(0, 100)}`);
  console.log(`✓ sso_token: ${launchJson.sso_token?.slice(0, 8)}...`);
  console.log(`✓ terminal_login: ${launchJson.terminal_login}`);
  console.log(`✓ expires_at: ${launchJson.expires_at}`);
} else {
  console.log(`\n✗ FAIL: HTTP ${launchRes.status}`);
}

process.exit(0);
