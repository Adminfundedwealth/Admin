/**
 * Test the complete SSO chain against production.
 * 1. Probe terminal /auth/sso/generate with SSO_API_KEY
 * 2. Verify the returned token is a valid JWT (not UUID)
 * 3. Verify the launchUrl structure
 * 4. Test admin terminal-launch API end-to-end
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes, createHmac } from 'crypto';

const TERMINAL_API_URL = 'https://terminal.fundedwealth.com';
const SSO_API_KEY = 'ee9f0bc82ab97f53ad376aa83573f88c347fa4b51e27a39639febcc57dfb563d';
const MAINSITE_API = 'https://fundedwealth-api-production.up.railway.app';
const INTERNAL_SECRET = 'fw_8e91c4f5d7a6b2c1e3f9a8d7b6c5e4f1234567890abcdef1234567890abcdef';
const SESSION_SECRET = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const sb = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);

const P = (ok, lbl, val='') => { console.log(`  ${ok?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m'} ${lbl}${val?' → '+val:''}`); return !!ok; };
const I = m => console.log(`  \x1b[36mℹ\x1b[0m  ${m}`);
const H = m => console.log(`\n\x1b[1m════════ ${m} ════════\x1b[0m`);

function makeCSRF() {
  const payload = randomBytes(32).toString('hex');
  const sig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function isJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try { JSON.parse(Buffer.from(parts[1], 'base64url').toString()); return true; } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
H('TEST 1: Terminal /auth/sso/generate (production)');
// ─────────────────────────────────────────────────────────────────────────────

// Get a real trading account + trader from DB
const { data: ta } = await sb
  .from('trading_accounts')
  .select('id, trader_id, challenge_id, account_code')
  .order('created_at', { ascending: false })
  .limit(1).single();

I(`Using trading_account: id=${ta?.id?.slice(0,8)} code=${ta?.account_code} trader=${ta?.trader_id?.slice(0,8)}`);

// Get trader email
const { data: trader } = ta?.trader_id ? await sb
  .from('terminal_traders')
  .select('id, external_id, email, display_name')
  .eq('id', ta.trader_id)
  .single() : { data: null };

I(`Trader: email=${trader?.email} ext=${trader?.external_id?.slice(0,8)}`);

const ssoPayload = {
  fwUserId: trader?.external_id || ta?.trader_id,
  accountId: ta?.id,
  challengeId: ta?.challenge_id || null,
  email: trader?.email || 'test@fundedwealth.com',
  name: trader?.display_name || 'Test Trader',
  accountCode: ta?.account_code,
};

I(`SSO payload: ${JSON.stringify(ssoPayload)}`);

let ssoToken = null;
let launchUrl = null;

try {
  const r = await fetch(`${TERMINAL_API_URL}/auth/sso/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sso-api-key': SSO_API_KEY,
    },
    body: JSON.stringify(ssoPayload),
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json();
  I(`Response: HTTP ${r.status} → ${JSON.stringify(j).slice(0,200)}`);
  P(r.ok, `Terminal /auth/sso/generate HTTP ${r.status}`, String(r.status));
  if (r.ok && j.token) {
    ssoToken = j.token;
    launchUrl = j.launchUrl || `${TERMINAL_API_URL}/auth/sso?token=${encodeURIComponent(j.token)}`;
    P(true, 'token received', ssoToken.slice(0,20)+'...');
    P(isJWT(ssoToken), 'token is a valid JWT (3 parts)', isJWT(ssoToken) ? 'yes' : 'NOT JWT - still wrong format');
    P(!!launchUrl, 'launchUrl built', launchUrl.slice(0,80));
    P(launchUrl.includes('/auth/sso'), 'launchUrl uses /auth/sso path');
    P(launchUrl.includes('token='), 'launchUrl has token= param');

    // Decode JWT header+payload (no verification — just inspect)
    const parts = ssoToken.split('.');
    if (parts.length === 3) {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      I(`JWT header: ${JSON.stringify(header)}`);
      I(`JWT payload: ${JSON.stringify(payload)}`);
      P(payload.sub === ssoPayload.fwUserId, `sub matches fwUserId`, payload.sub);
      P(payload.accountId === ssoPayload.accountId, `accountId matches`, payload.accountId?.slice(0,8));
      P(!!payload.exp, 'exp claim present', new Date(payload.exp * 1000).toISOString());
      const ttl = payload.exp - Math.floor(Date.now()/1000);
      P(ttl > 0 && ttl <= 120, `token expires in ~60s (ttl=${ttl}s)`);
    }
  } else {
    P(false, 'SSO generate succeeded', JSON.stringify(j).slice(0,100));
  }
} catch (e) {
  P(false, `Terminal reachable at ${TERMINAL_API_URL}`, e.message.slice(0,80));
  console.log(`\n  Trying to diagnose: checking terminal health...`);
  try {
    const h = await fetch(`${TERMINAL_API_URL}/health`, { signal: AbortSignal.timeout(5000) });
    I(`Terminal health: ${h.status}`);
  } catch (he) {
    I(`Terminal health also failed: ${he.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
H('TEST 2: Admin terminal-launch API end-to-end');
// ─────────────────────────────────────────────────────────────────────────────

// Login to admin
const loginRes = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'adminfundedwealth@gmail.com', password: 'Founder@Admin2025!' }),
  signal: AbortSignal.timeout(10000),
}).catch(e => { I(`Admin server not running: ${e.message}`); return null; });

if (loginRes) {
  const loginJson = await loginRes.json();
  const cookies = loginRes.headers.getSetCookie();
  const sessionCookie = cookies.find(c => c.startsWith('session_token='))?.split(';')[0];
  const csrf = makeCSRF();
  P(loginJson.success, 'Admin login', String(loginRes.status));

  if (sessionCookie && ta?.id) {
    const launchRes = await fetch('http://localhost:3000/api/founder/terminal-launch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${sessionCookie}; __csrf_token=${csrf}`,
        'x-csrf-token': csrf,
      },
      body: JSON.stringify({ trading_account_id: ta.id }),
      signal: AbortSignal.timeout(15000),
    }).catch(e => { I(`Admin terminal-launch error: ${e.message}`); return null; });

    if (launchRes) {
      const launchJson = await launchRes.json();
      I(`terminal-launch response: HTTP ${launchRes.status}`);
      I(`Response: ${JSON.stringify(launchJson).slice(0,300)}`);
      P(launchRes.ok, 'terminal-launch HTTP 200', String(launchRes.status));
      P(!!launchJson.launch_url, 'launch_url present', launchJson.launch_url?.slice(0,80) || 'MISSING');
      if (launchJson.launch_url) {
        P(launchJson.launch_url.includes('/auth/sso'), 'launch_url uses /auth/sso');
        P(launchJson.launch_url.includes('token='), 'launch_url has JWT token param');
        const tokenParam = new URL(launchJson.launch_url).searchParams.get('token');
        P(tokenParam && isJWT(tokenParam), 'embedded token is a JWT', tokenParam?.slice(0,20)+'...' || 'MISSING');
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
H('TEST 3: Provision catalog (production secrets)');
// ─────────────────────────────────────────────────────────────────────────────

try {
  const r = await fetch(`${MAINSITE_API}/api/provisioning/catalog`, {
    headers: { 'x-internal-provision-secret': INTERNAL_SECRET },
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  P(r.ok, `Catalog HTTP ${r.status}`, String(r.status));
  if (r.ok) {
    const products = j.products || [];
    P(products.length > 0, `${products.length} products in catalog`);
    for (const p of products) {
      I(`${p.slug}: profitTarget=${p.profitTarget} dailyLoss=${p.dailyLoss} maxLoss=${p.maxLoss} leverage=${p.leverage}`);
    }
  }
} catch (e) {
  P(false, `Main site catalog`, e.message.slice(0,80));
}

// ─────────────────────────────────────────────────────────────────────────────
H('FINAL: Secret Alignment');
// ─────────────────────────────────────────────────────────────────────────────

console.log(`
  Main site TERMINAL_API_URL: ${TERMINAL_API_URL}
  Main site SSO_API_KEY:      ${SSO_API_KEY.slice(0,8)}...[${SSO_API_KEY.length} chars]

  Terminal expects:
    x-sso-api-key = SSO_API_KEY (matching main site value)
    SSO_SHARED_SECRET = used to sign JWT (terminal internal, not needed by admin)

  Admin needs:
    TERMINAL_API_URL = ${TERMINAL_API_URL}   ✓ set
    SSO_API_KEY = ${SSO_API_KEY.slice(0,8)}...   ✓ set

  Flow: Admin → POST terminal/auth/sso/generate (x-sso-api-key) → JWT token
        Admin → return launchUrl with JWT embedded
        Browser → GET terminal/auth/sso?token=<JWT>
        Terminal → jwt.verify(token, SSO_SHARED_SECRET) → sets fw_session cookie → redirect /
`);
