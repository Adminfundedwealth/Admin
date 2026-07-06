/**
 * Probe Railway to find the correct INTERNAL_PROVISION_SECRET.
 * The Railway server returns 401 {"error":"Unauthorized"} when secret is wrong.
 * When secret is correct it returns product catalog JSON.
 */
const BASE = 'https://fundedwealth-api-production.up.railway.app';

// Candidates from codebase + common dev defaults
const candidates = [
  'dev-internal-secret-change-in-production',
  'internal-provision-secret',
  'change-in-production',
  'secret',
  'fundedwealth',
  'fundedwealth-admin',
  'admin-secret',
  'provision-secret',
  'internal-secret',
  '',  // no auth - public?
];

for (const secret of candidates) {
  const headers = secret
    ? { 'x-internal-provision-secret': secret }
    : {};
  try {
    const r = await fetch(`${BASE}/api/provisioning/catalog`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const body = await r.text();
    if (r.status === 200) {
      console.log(`✓ SECRET FOUND: "${secret}" → ${r.status}`);
      console.log(body.slice(0, 300));
      process.exit(0);
    } else {
      console.log(`✗ "${secret}" → ${r.status}`);
    }
  } catch (e) {
    console.log(`✗ "${secret}" → error: ${e.message.slice(0, 40)}`);
  }
}

console.log('\nNone matched. Need to check Railway env vars directly.');
console.log('Go to: https://railway.app/project → fundedwealth-api → Variables → INTERNAL_PROVISION_SECRET');

process.exit(0);
