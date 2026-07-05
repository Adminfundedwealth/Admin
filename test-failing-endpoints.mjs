// Test failing endpoints to capture exact error messages
const BASE_URL = 'http://localhost:4200';

async function testEndpoint(name, url) {
  try {
    // Login first
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'adminfundedwealth@gmail.com', password: 'Founder@Admin2025!' })
    });
    const sessionToken = loginRes.headers.get('set-cookie')?.match(/session_token=([^;]+)/)?.[1];
    
    // Get CSRF
    const pageRes = await fetch(`${BASE_URL}/executive`, {
      headers: { 'Cookie': `session_token=${sessionToken}` }
    });
    const csrfToken = pageRes.headers.get('set-cookie')?.match(/__csrf_token=([^;]+)/)?.[1];
    
    // Test endpoint
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: {
        'Cookie': `session_token=${sessionToken}; __csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken
      }
    });
    
    const body = await res.text();
    console.log(`\n=== ${name} ===`);
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${body.substring(0, 500)}`);
    
  } catch (e) {
    console.log(`\n=== ${name} ===`);
    console.log(`ERROR: ${e.message}`);
  }
}

(async () => {
  await testEndpoint('Payouts', '/api/payouts');
  await testEndpoint('Risk', '/api/risk');
  await testEndpoint('Support', '/api/support');
  await testEndpoint('Certificates', '/api/certificates');
  await testEndpoint('Affiliates', '/api/affiliates');
})();
