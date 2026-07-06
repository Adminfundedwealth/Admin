/**
 * Fetch Railway production environment variables - full values for auth keys.
 */
const ACCESS_TOKEN = 'hmVwz7FrWR4kTiGrSWf_EzMkYod-31aiaUOA5KW5LIR';
const PROJECT_ID   = '5058c1dc-ab42-4276-8cf5-12f94b30ef2d';
const ENV_ID       = '16f08975-7d0d-4624-afeb-3ac5f2743402';
const SERVICE_ID   = 'f2f00ffd-e354-4909-aa27-cd20d7ab5733';  // main site api-server

// First list all services in the project
const LIST_SERVICES = `
query Services($projectId: String!) {
  project(id: $projectId) {
    services { edges { node { id name } } }
  }
}`;

const VARS_QUERY = `
query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}`;

const svcRes = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
  body: JSON.stringify({ query: LIST_SERVICES, variables: { projectId: PROJECT_ID } }),
});
const svcJson = await svcRes.json();
const services = svcJson.data?.project?.services?.edges?.map(e => e.node) || [];
console.log('Services in project:');
for (const s of services) console.log(`  id=${s.id} name=${s.name}`);

// Get vars for main site
const mainRes = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
  body: JSON.stringify({ query: VARS_QUERY, variables: { projectId: PROJECT_ID, environmentId: ENV_ID, serviceId: SERVICE_ID } }),
});
const mainJson = await mainRes.json();
const mainVars = mainJson.data?.variables || {};

console.log('\n=== Main Site Railway Vars (full values for SSO keys) ===');
const SSO_KEYS = ['SSO_API_KEY', 'TERMINAL_API_URL', 'INTERNAL_PROVISION_SECRET', 'JWT_SECRET'];
for (const k of SSO_KEYS) {
  if (mainVars[k]) console.log(`${k}=${mainVars[k]}`);
  else console.log(`${k}=<NOT SET>`);
}

// Get vars for each service — find terminal service
for (const svc of services) {
  if (svc.id === SERVICE_ID) continue; // skip main site already done
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ query: VARS_QUERY, variables: { projectId: PROJECT_ID, environmentId: ENV_ID, serviceId: svc.id } }),
  });
  const j = await r.json();
  const v = j.data?.variables || {};
  console.log(`\n=== ${svc.name} (${svc.id}) ===`);
  const TERM_KEYS = ['SSO_API_KEY', 'SSO_SHARED_SECRET', 'JWT_SECRET', 'PROVISIONING_API_KEY', 'TERMINAL_URL', 'INTERNAL_PROVISION_SECRET'];
  for (const k of TERM_KEYS) {
    if (v[k] !== undefined) console.log(`  ${k}=${v[k]}`);
    else console.log(`  ${k}=<NOT SET>`);
  }
  if (Object.keys(v).length) console.log(`  All keys: ${Object.keys(v).sort().join(', ')}`);
}

process.exit(0);
