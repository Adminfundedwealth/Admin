/**
 * Find terminal service in all Railway projects and get its env vars.
 */
const ACCESS_TOKEN = 'hmVwz7FrWR4kTiGrSWf_EzMkYod-31aiaUOA5KW5LIR';

// List all projects
const LIST_PROJECTS = `query { me { projects { edges { node { id name services { edges { node { id name } } } } } } } }`;

const VARS_QUERY = `
query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}`;

const ENV_QUERY = `
query Environments($projectId: String!) {
  project(id: $projectId) { environments { edges { node { id name } } } }
}`;

async function gql(query, variables = {}) {
  const r = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000),
  });
  return r.json();
}

// Get all projects
const projectsRes = await gql(LIST_PROJECTS);
const projects = projectsRes.data?.me?.projects?.edges?.map(e => e.node) || [];
console.log(`Found ${projects.length} projects:`);

for (const proj of projects) {
  const services = proj.services?.edges?.map(e => e.node) || [];
  console.log(`\nProject: ${proj.name} (${proj.id})`);
  for (const svc of services) {
    console.log(`  Service: ${svc.name} (${svc.id})`);
  }
}

// Look for terminal project
const terminalProj = projects.find(p => p.name.toLowerCase().includes('terminal'));
const mainProj = projects.find(p => p.id === '5058c1dc-ab42-4276-8cf5-12f94b30ef2d');

for (const proj of [terminalProj, ...projects.filter(p => p !== terminalProj && p !== mainProj)]) {
  if (!proj) continue;
  // Get environments
  const envRes = await gql(ENV_QUERY, { projectId: proj.id });
  const envs = envRes.data?.project?.environments?.edges?.map(e => e.node) || [];
  const prodEnv = envs.find(e => e.name === 'production') || envs[0];
  if (!prodEnv) continue;

  const services = proj.services?.edges?.map(e => e.node) || [];
  for (const svc of services) {
    const varsRes = await gql(VARS_QUERY, { projectId: proj.id, environmentId: prodEnv.id, serviceId: svc.id });
    const vars = varsRes.data?.variables || {};
    const keys = Object.keys(vars);
    if (!keys.length) continue;
    console.log(`\n=== ${proj.name} / ${svc.name} (env: ${prodEnv.name}) ===`);
    for (const k of ['SSO_SHARED_SECRET', 'SSO_API_KEY', 'JWT_SECRET', 'PROVISIONING_API_KEY', 'TERMINAL_URL', 'FW_DASHBOARD_URL']) {
      if (vars[k]) console.log(`  ${k}=${vars[k]}`);
    }
    console.log(`  All keys: ${keys.sort().join(', ')}`);
  }
}

process.exit(0);
