/**
 * Probe the Railway main site API to find correct auth + available endpoints.
 */
const BASE = 'https://fundedwealth-api-production.up.railway.app';
const DEV_SECRET = 'dev-internal-secret-change-in-production';

async function probe(path, headers = {}, method = 'GET', body = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json', ...headers }, signal: AbortSignal.timeout(8000) };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${path}`, opts);
    const txt = await r.text();
    return { status: r.status, body: txt.slice(0, 200), ct: r.headers.get('content-type') };
  } catch (e) { return { status: 0, body: e.message.slice(0, 80) }; }
}

// 1. Health check
let r = await probe('/health');
console.log(`GET /health → ${r.status}: ${r.body}`);

r = await probe('/');
console.log(`GET / → ${r.status}: ${r.body.slice(0,100)}`);

r = await probe('/api');
console.log(`GET /api → ${r.status}: ${r.body.slice(0,100)}`);

r = await probe('/api/health');
console.log(`GET /api/health → ${r.status}: ${r.body.slice(0,100)}`);

// 2. Catalog with no auth
r = await probe('/api/provisioning/catalog');
console.log(`GET /api/provisioning/catalog (no auth) → ${r.status}: ${r.body.slice(0,100)}`);

// 3. Catalog with dev secret
r = await probe('/api/provisioning/catalog', { 'x-internal-provision-secret': DEV_SECRET });
console.log(`GET /api/provisioning/catalog (dev secret) → ${r.status}: ${r.body.slice(0,100)}`);

// 4. Try different secret formats
for (const header of ['x-admin-secret', 'x-api-key', 'Authorization', 'x-service-secret']) {
  r = await probe('/api/provisioning/catalog', { [header]: DEV_SECRET });
  console.log(`GET /api/provisioning/catalog (${header}: dev) → ${r.status}: ${r.body.slice(0,60)}`);
}

// 5. Try without any secret — maybe catalog is public
r = await probe('/api/products');
console.log(`GET /api/products (no auth) → ${r.status}: ${r.body.slice(0,100)}`);

r = await probe('/api/catalog');
console.log(`GET /api/catalog → ${r.status}: ${r.body.slice(0,100)}`);

// 6. Check what paths exist
for (const p of ['/api/provisioning', '/api/plans', '/api/challenge-types']) {
  r = await probe(p);
  console.log(`GET ${p} → ${r.status}: ${r.body.slice(0,80)}`);
}

process.exit(0);
