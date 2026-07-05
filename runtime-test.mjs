// Runtime verification test for Admin OS
const BASE_URL = 'http://localhost:4200';
const credentials = { email: 'adminfundedwealth@gmail.com', password: 'Founder@Admin2025!' };

async function runTests() {
  console.log('=== ADMIN RUNTIME VERIFICATION ===\n');
  
  // 1. Login
  console.log('1. Authentication');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });
  
  if (!loginRes.ok) {
    console.log('❌ Login failed');
    return;
  }
  
  const loginData = await loginRes.json();
  const sessionToken = loginRes.headers.get('set-cookie')?.match(/session_token=([^;]+)/)?.[1];
  console.log(`✅ Login successful - staffId: ${loginData.staffId}`);
  
  // 2. Get CSRF token
  const pageRes = await fetch(`${BASE_URL}/executive`, {
    headers: { 'Cookie': `session_token=${sessionToken}` }
  });
  const csrfToken = pageRes.headers.get('set-cookie')?.match(/__csrf_token=([^;]+)/)?.[1];
  console.log(`✅ CSRF token obtained\n`);
  
  const headers = {
    'Cookie': `session_token=${sessionToken}; __csrf_token=${csrfToken}`,
    'x-csrf-token': csrfToken
  };
  
  // 3. Test API Endpoints
  console.log('2. API Endpoints');
  const endpoints = [
    { name: 'Executive Metrics', url: '/api/executive/metrics' },
    { name: 'Executive Alerts', url: '/api/executive/alerts' },
    { name: 'Executive Queues', url: '/api/executive/queues' },
    { name: 'Executive Revenue', url: '/api/executive/revenue?days=30' },
    { name: 'System Health', url: '/api/executive/system-health' },
    { name: 'Users List', url: '/api/users' },
    { name: 'Staff List', url: '/api/staff' },
    { name: 'KYC List', url: '/api/kyc' },
    { name: 'Challenges', url: '/api/challenges' },
    { name: 'Payments', url: '/api/payments' },
    { name: 'Payouts', url: '/api/payouts' },
    { name: 'Risk Alerts', url: '/api/risk' },
    { name: 'Support', url: '/api/support' },
    { name: 'Funded Accounts', url: '/api/funded' },
    { name: 'Certificates', url: '/api/certificates' },
    { name: 'Affiliates', url: '/api/affiliates' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint.url}`, { headers });
      if (res.ok) {
        console.log(`✅ ${endpoint.name} [${res.status}]`);
        passed++;
      } else {
        console.log(`❌ ${endpoint.name} [${res.status}]`);
        failed++;
      }
    } catch (e) {
      console.log(`❌ ${endpoint.name} [ERROR: ${e.message}]`);
      failed++;
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Passed: ${passed}/${endpoints.length}`);
  console.log(`Failed: ${failed}/${endpoints.length}`);
  console.log(`Success Rate: ${(passed/endpoints.length*100).toFixed(1)}%`);
}

runTests().catch(console.error);
