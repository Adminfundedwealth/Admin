/**
 * 1. Probe Railway backend directly (bypass Vercel)
 * 2. Find terminal Railway service env vars
 * 3. Set SSO_API_KEY + SSO_SHARED_SECRET on terminal Railway service
 */

const RAILWAY_BACKEND = 'https://terminal-production-4429.up.railway.app';
const VERCEL_TERMINAL = 'https://terminal.fundedwealth.com';
const SSO_API_KEY = 'ee9f0bc82ab97f53ad376aa83573f88c347fa4b51e27a39639febcc57dfb563d';
const ACCESS_TOKEN = 'hmVwz7FrWR4kTiGrSWf_EzMkYod-31aiaUOA5KW5LIR';

const payload = {
  fwUserId: 'c458d079-f187-4aa3-b1b5-c45ada777b72',
  accountId: '24c452c5-ba3f-4a34-94aa-d23393017b67',
  email: 'propfirmmarket@gmail.com',
  name: 'Aman singh',
};

async function probe(base, path, method='GET', body=null, hdrs={}) {
  try {
    const opts = { method, headers: {'Content-Type':'application/json',...hdrs}, signal: AbortSignal.timeout(8000) };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${base}${path}`, opts);
    const ct = r.headers.get('content-type')||'';
    const txt = await r.text();
    const snippet = txt.slice(0,150).replace(/\n/g,' ');
    console.log(`${method.padEnd(4)} ${base.replace('https://','').slice(0,35).padEnd(35)} ${path.padEnd(30)} → ${r.status} | ${snippet}`);
    return { ok: r.ok, status: r.status, isJSON: ct.includes('json'), body: ct.includes('json') ? JSON.parse(txt) : txt };
  } catch(e) {
    console.log(`${method.padEnd(4)} ${base.replace('https://','').slice(0,35).padEnd(35)} ${path.padEnd(30)} → ERR ${e.message.slice(0,60)}`);
    return null;
  }
}

console.log('=== Probing Railway backend directly ===');
await probe(RAILWAY_BACKEND, '/health');
await probe(RAILWAY_BACKEND, '/auth/sso', 'GET');
await probe(RAILWAY_BACKEND, '/auth/sso/generate', 'POST', payload, {'x-sso-api-key': SSO_API_KEY});
await probe(RAILWAY_BACKEND, '/auth/sso/generate', 'POST', payload);

console.log('\n=== Probing via Vercel (terminal.fundedwealth.com) ===');
await probe(VERCEL_TERMINAL, '/health');
await probe(VERCEL_TERMINAL, '/auth/sso', 'GET');
await probe(VERCEL_TERMINAL, '/auth/sso/generate', 'POST', payload, {'x-sso-api-key': SSO_API_KEY});

// Find terminal Railway project via GraphQL
console.log('\n=== Finding terminal Railway project ===');
async function gql(query, variables={}) {
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':`Bearer ${ACCESS_TOKEN}`},
    body: JSON.stringify({query, variables}),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

// Search all projects this token has access to
const LIST = `query { me { projects { edges { node { id name services { edges { node { id name } } } } } } } }`;
const ENV_Q = `query($pid:String!,$eid:String!,$sid:String!){variables(projectId:$pid,environmentId:$eid,serviceId:$sid)}`;
const ENVS_Q = `query($pid:String!){project(id:$pid){environments{edges{node{id name}}}}}`;
const SET_Q = `mutation($input:VariableCollectionUpsertInput!){variableCollectionUpsert(input:$input)}`;

const p = await gql(LIST);
const projects = p.data?.me?.projects?.edges?.map(e=>e.node) || [];
console.log(`Projects accessible: ${projects.map(x=>x.name).join(', ')}`);

for (const proj of projects) {
  const svcs = proj.services?.edges?.map(e=>e.node) || [];
  for (const svc of svcs) {
    if (svc.name.toLowerCase().includes('terminal') || proj.name.toLowerCase().includes('terminal')) {
      console.log(`\nFound terminal service: proj=${proj.name}(${proj.id}) svc=${svc.name}(${svc.id})`);

      // Get environments
      const envRes = await gql(ENVS_Q, {pid: proj.id});
      const envs = envRes.data?.project?.environments?.edges?.map(e=>e.node) || [];
      const prodEnv = envs.find(e=>e.name==='production') || envs[0];
      if (!prodEnv) { console.log('  No environment found'); continue; }

      // Get current vars
      const varsRes = await gql(ENV_Q, {pid: proj.id, eid: prodEnv.id, sid: svc.id});
      const vars = varsRes.data?.variables || {};
      console.log(`  Environment: ${prodEnv.name}`);
      console.log(`  Current SSO_API_KEY: ${vars.SSO_API_KEY ? vars.SSO_API_KEY.slice(0,8)+'...' : '<NOT SET>'}`);
      console.log(`  Current SSO_SHARED_SECRET: ${vars.SSO_SHARED_SECRET ? vars.SSO_SHARED_SECRET.slice(0,8)+'...' : '<NOT SET>'}`);
      console.log(`  Current PROVISIONING_API_KEY: ${vars.PROVISIONING_API_KEY || '<NOT SET>'}`);
      console.log(`  All keys: ${Object.keys(vars).sort().join(', ')}`);
    }
  }
}

process.exit(0);
