/**
 * Test the complete Founder login flow end-to-end.
 */
import { TOTP } from 'otpauth';

async function main() {
  console.log('=== Testing Complete Login Flow ===\n');

  // Step 1: Login with credentials
  console.log('1. POST /api/auth/login');
  const loginRes = await fetch('http://localhost:4200/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cryptoaman9152@gmail.com', password: 'Founder@Admin2025!' }),
  });
  const loginData = await loginRes.json();
  console.log(`   Status: ${loginRes.status}`);
  console.log(`   Response: ${JSON.stringify(loginData)}`);
  
  if (!loginData.requiresSetup2FA) {
    console.log('   ✗ Expected requiresSetup2FA but got something else');
    process.exit(1);
  }
  console.log('   ✓ Credentials valid, requires 2FA setup');

  const staffId = loginData.staffId;

  // Step 2: Initialize 2FA setup
  console.log('\n2. POST /api/auth/2fa/setup');
  const setupRes = await fetch('http://localhost:4200/api/auth/2fa/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId }),
  });
  const setupData = await setupRes.json();
  console.log(`   Status: ${setupRes.status}`);
  console.log(`   QR URL: ${setupData.qrCodeUrl?.substring(0, 60)}...`);
  console.log(`   Secret: ${setupData.secret}`);
  
  if (!setupData.secret) {
    console.log('   ✗ No secret returned');
    process.exit(1);
  }
  console.log('   ✓ TOTP secret generated');

  // Step 3: Generate a valid TOTP code from the secret
  console.log('\n3. Generating TOTP code from secret...');
  const totp = new TOTP({
    secret: setupData.secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  const code = totp.generate();
  console.log(`   Generated code: ${code}`);

  // Step 4: Verify the code and complete setup
  console.log('\n4. POST /api/auth/2fa/setup/verify');
  const verifyRes = await fetch('http://localhost:4200/api/auth/2fa/setup/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, secret: setupData.secret, staffId }),
  });
  const verifyData = await verifyRes.json();
  console.log(`   Status: ${verifyRes.status}`);
  console.log(`   Response: ${JSON.stringify(verifyData)}`);
  
  // Check for session cookie
  const setCookieHeader = verifyRes.headers.get('set-cookie');
  console.log(`   Set-Cookie: ${setCookieHeader ? 'YES' : 'NO'}`);
  
  if (verifyRes.status === 200 && verifyData.success) {
    console.log('   ✓ 2FA setup complete, session created');
  } else {
    console.log('   ✗ Verification failed');
    process.exit(1);
  }

  // Step 5: Use session cookie to access dashboard
  if (setCookieHeader) {
    const sessionToken = setCookieHeader.split('session_token=')[1]?.split(';')[0];
    console.log(`\n5. Testing dashboard access with session cookie`);
    console.log(`   Token (first 20 chars): ${sessionToken?.substring(0, 20)}...`);
    
    const dashRes = await fetch('http://localhost:4200/executive', {
      headers: { 'Cookie': `session_token=${sessionToken}` },
      redirect: 'manual',
    });
    console.log(`   Dashboard status: ${dashRes.status}`);
    
    if (dashRes.status === 200) {
      console.log('   ✓ Dashboard accessible with session!');
    } else if (dashRes.status === 307 || dashRes.status === 302) {
      const location = dashRes.headers.get('location');
      console.log(`   Redirect to: ${location}`);
      if (location?.includes('/login')) {
        console.log('   ✗ Still redirecting to login');
      } else {
        console.log('   ✓ Redirect (not to login)');
      }
    }
  }

  console.log('\n=== COMPLETE ===');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
