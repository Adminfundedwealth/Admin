/**
 * Direct API Verification Script
 * Tests all endpoints without browser auth.
 * Run: node tests/api-verify.mjs
 */

const BASE = 'http://localhost:4200';

const endpoints = [
  { method: 'GET', path: '/api/executive/queues', desc: 'Queue counts' },
  { method: 'GET', path: '/api/executive/risk-health', desc: 'Risk health' },
  { method: 'GET', path: '/api/executive/system-health', desc: 'System health' },
  { method: 'GET', path: '/api/executive/metrics', desc: 'Executive metrics' },
  { method: 'GET', path: '/api/executive/revenue?days=7', desc: 'Revenue data' },
  { method: 'GET', path: '/api/executive/alerts', desc: 'Operational alerts' },
  { method: 'GET', path: '/api/risk/heatmap', desc: 'Risk heatmap' },
  { method: 'GET', path: '/api/risk/exposure', desc: 'Capital exposure' },
  { method: 'GET', path: '/api/feed?page=1&limit=10', desc: 'Operations feed' },
  { method: 'GET', path: '/api/staff/presence', desc: 'Staff presence' },
  { method: 'POST', path: '/api/copilot/query', desc: 'AI Copilot', body: { query: 'How many pending payouts?' } },
];

async function verify() {
  console.log('='.repeat(70));
  console.log('FundedWealth Admin OS — API Verification');
  console.log('='.repeat(70));
  console.log('');

  let pass = 0, fail = 0, authBlocked = 0;

  for (const ep of endpoints) {
    try {
      const opts = { method: ep.method, headers: { 'Content-Type': 'application/json' } };
      if (ep.body) opts.body = JSON.stringify(ep.body);

      const res = await fetch(`${BASE}${ep.path}`, opts);
      const body = await res.json().catch(() => null);

      if (res.status === 200) {
        pass++;
        const preview = JSON.stringify(body).substring(0, 120);
        console.log(`✅ PASS  ${ep.method} ${ep.path}`);
        console.log(`         ${ep.desc}`);
        console.log(`         Response: ${preview}...`);
      } else if (res.status === 401) {
        authBlocked++;
        console.log(`🔒 AUTH  ${ep.method} ${ep.path}`);
        console.log(`         ${ep.desc} — requires authentication (401)`);
      } else {
        fail++;
        console.log(`❌ FAIL  ${ep.method} ${ep.path} → ${res.status}`);
        console.log(`         ${ep.desc}`);
        console.log(`         Body: ${JSON.stringify(body)}`);
      }
    } catch (err) {
      fail++;
      console.log(`❌ ERROR ${ep.method} ${ep.path}`);
      console.log(`         ${err.message}`);
    }
    console.log('');
  }

  console.log('='.repeat(70));
  console.log(`RESULTS: ${pass} PASS | ${authBlocked} AUTH_BLOCKED | ${fail} FAIL`);
  console.log('='.repeat(70));

  if (authBlocked > 0) {
    console.log('');
    console.log('NOTE: AUTH_BLOCKED means the endpoint exists and responds correctly');
    console.log('but requires a valid Supabase session cookie. This is EXPECTED behavior.');
    console.log('');
    console.log('To run full tests:');
    console.log('1. Configure real Supabase credentials in .env.local');
    console.log('2. Create a Founder account in Supabase');
    console.log('3. Run: npx playwright test');
  }
}

verify();
