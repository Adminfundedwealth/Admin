const BASE = 'https://terminal.fundedwealth.com';
const SSO_API_KEY = 'ee9f0bc82ab97f53ad376aa83573f88c347fa4b51e27a39639febcc57dfb563d';

async function probe(path, method='GET', body=null, hdrs={}) {
  try {
    const opts = { method, headers: {'Content-Type':'application/json',...hdrs}, signal: AbortSignal.timeout(6000) };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${path}`, opts);
    const ct = r.headers.get('content-type')||'';
    const txt = await r.text();
    const snippet = txt.slice(0,100).replace(/\n/g,' ');
    console.log(`${method.padEnd(4)} ${path.padEnd(35)} → ${r.status} ${ct.includes('json')?'JSON':'HTML'} | ${snippet}`);
    return { ok: r.ok, status: r.status, json: ct.includes('json') ? JSON.parse(txt) : null, text: txt };
  } catch(e) {
    console.log(`${method.padEnd(4)} ${path.padEnd(35)} → ERR  ${e.message.slice(0,60)}`);
    return null;
  }
}

// Enumerate all known routes from auth.routes.js
await probe('/health');
await probe('/auth/sso',                   'GET');
await probe('/auth/sso',                   'POST');
await probe('/auth/sso/generate',          'POST', {fwUserId:'test',accountId:'test'}, {'x-sso-api-key':SSO_API_KEY});
await probe('/auth/logout',                'POST');
await probe('/auth/verify',                'GET');
await probe('/auth/logout-all',            'POST');

// Maybe the API is prefixed
await probe('/api/auth/sso/generate',      'POST', {fwUserId:'test',accountId:'test'}, {'x-sso-api-key':SSO_API_KEY});
await probe('/api/auth/verify',            'GET');

// Check if there's a provisioning endpoint  
await probe('/provisioning/health',        'GET');
await probe('/api/account',                'GET');

process.exit(0);
