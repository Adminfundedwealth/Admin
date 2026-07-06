const BASE = 'https://terminal.fundedwealth.com';
const SSO_API_KEY = 'ee9f0bc82ab97f53ad376aa83573f88c347fa4b51e27a39639febcc57dfb563d';

async function probe(path, method='GET', body=null, headers={}) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: AbortSignal.timeout(8000),
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${path}`, opts);
    const ct = r.headers.get('content-type') || '';
    const txt = await r.text();
    const isJSON = ct.includes('json');
    console.log(`${method} ${path} → ${r.status} (${ct.split(';')[0]}) | ${txt.slice(0,120)}`);
    return { status: r.status, isJSON, body: isJSON ? JSON.parse(txt) : txt };
  } catch(e) {
    console.log(`${method} ${path} → ERROR: ${e.message.slice(0,80)}`);
    return { status: 0, error: e.message };
  }
}

const payload = {
  fwUserId: 'c458d079-f187-4aa3-b1b5-c45ada777b72',
  accountId: '24c452c5-ba3f-4a34-94aa-d23393017b67',
  email: 'propfirmmarket@gmail.com',
  name: 'Test Trader',
};

// Check health
await probe('/health');
await probe('/api/health');

// Try SSO generate - various paths
await probe('/auth/sso/generate', 'POST', payload, { 'x-sso-api-key': SSO_API_KEY });
await probe('/api/auth/sso/generate', 'POST', payload, { 'x-sso-api-key': SSO_API_KEY });
await probe('/auth/sso', 'GET');  // without token - see what it says
await probe('/api/auth/sso', 'GET');

// Try without API key to understand auth behavior
await probe('/auth/sso/generate', 'POST', payload);
await probe('/api/auth/sso/generate', 'POST', payload);

process.exit(0);
