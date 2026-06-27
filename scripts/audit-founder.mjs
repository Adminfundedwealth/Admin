import { createClient } from '@supabase/supabase-js';
import { TOTP } from 'otpauth';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function query(sql) {
  const { data, error } = await supabase.rpc('query_sql', { sql_query: sql });
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('       FOUNDER LOGIN AUDIT');
  console.log('═══════════════════════════════════════\n');

  // 1. Founder record
  const staff = await query("SELECT id, email, name, status, totp_enabled, totp_secret, password_hash, failed_login_attempts, locked_until FROM staff_members WHERE email = 'cryptoaman9152@gmail.com'");
  if (!staff || staff.length === 0) {
    console.log('✗ Founder record DOES NOT EXIST');
    process.exit(1);
  }
  const f = staff[0];
  console.log('1. Founder record exists:  ✓');
  console.log(`2. Email:                  ${f.email}`);
  console.log(`3. Password hash:          ${f.password_hash ? f.password_hash.substring(0, 20) + '...' : 'MISSING'}`);
  
  // 4. Role
  const roles = await query(`SELECT r.name FROM staff_role_assignments sra JOIN roles r ON r.id = sra.role_id WHERE sra.staff_id = '${f.id}'`);
  const roleName = roles?.[0]?.name || 'NONE';
  console.log(`4. Role:                   ${roleName}`);
  
  // 5. Status
  console.log(`5. Active:                 ${f.status === 'active' ? 'true ✓' : f.status + ' ✗'}`);
  
  // 6. 2FA status
  console.log(`6. 2FA enabled:            ${f.totp_enabled}`);
  console.log(`   TOTP secret:            ${f.totp_secret ? 'SET' : 'NULL'}`);

  // 7. Authenticate
  console.log('\n─── Authentication Test ───');
  const loginRes = await fetch('http://localhost:4200/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cryptoaman9152@gmail.com', password: 'Founder@Admin2025!' }),
  });
  const loginData = await loginRes.json();
  console.log(`   POST /api/auth/login → ${loginRes.status}`);
  console.log(`   Response: ${JSON.stringify(loginData)}`);

  if (loginRes.status !== 200) {
    console.log(`\n✗ Authentication FAILED: ${loginData.error?.message}`);
    process.exit(1);
  }
  console.log('7. Authentication:         ✓ SUCCESS');

  // Determine flow
  let sessionToken = null;

  if (loginData.requiresSetup2FA) {
    console.log('   Flow: requires 2FA setup (first login)');
    
    // Setup 2FA
    const setupRes = await fetch('http://localhost:4200/api/auth/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: loginData.staffId }),
    });
    const setupData = await setupRes.json();
    if (setupRes.status !== 200) {
      console.log(`   ✗ 2FA setup failed: ${setupData.error?.message}`);
      process.exit(1);
    }
    console.log(`   2FA setup: ✓ (secret: ${setupData.secret})`);

    // Generate code
    const totp = new TOTP({ secret: setupData.secret, algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();

    // Verify
    const verifyRes = await fetch('http://localhost:4200/api/auth/2fa/setup/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, secret: setupData.secret, staffId: loginData.staffId }),
    });
    const verifyData = await verifyRes.json();
    const cookie = verifyRes.headers.get('set-cookie');
    if (verifyRes.status !== 200 || !verifyData.success) {
      console.log(`   ✗ 2FA verify failed: ${verifyData.error?.message}`);
      process.exit(1);
    }
    sessionToken = cookie?.split('session_token=')[1]?.split(';')[0];
    console.log(`   2FA verify: ✓`);

  } else if (loginData.requires2FA) {
    console.log('   Flow: requires 2FA verification (returning user)');
    
    // Need to generate code from existing secret
    const staffData = await query(`SELECT totp_secret FROM staff_members WHERE id = '${loginData.staffId || f.id}'`);
    const totpSecret = staffData?.[0]?.totp_secret;
    if (!totpSecret) {
      console.log('   ✗ TOTP secret not found in DB');
      process.exit(1);
    }
    const totp = new TOTP({ secret: totpSecret, algorithm: 'SHA1', digits: 6, period: 30 });
    const code = totp.generate();

    const verifyRes = await fetch('http://localhost:4200/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, challengeToken: loginData.challengeToken }),
    });
    const verifyData = await verifyRes.json();
    const cookie = verifyRes.headers.get('set-cookie');
    if (verifyRes.status !== 200 || !verifyData.success) {
      console.log(`   ✗ 2FA verify failed: ${JSON.stringify(verifyData)}`);
      process.exit(1);
    }
    sessionToken = cookie?.split('session_token=')[1]?.split(';')[0];
    console.log(`   2FA verify: ✓`);
  }

  // 8. Session cookie
  if (sessionToken) {
    console.log(`8. Session cookie:         ✓ (${sessionToken.substring(0, 16)}...)`);
  } else {
    console.log('8. Session cookie:         ✗ NOT SET');
    process.exit(1);
  }

  // 9. Dashboard access
  const dashRes = await fetch('http://localhost:4200/executive', {
    headers: { 'Cookie': `session_token=${sessionToken}` },
    redirect: 'manual',
  });
  const dashStatus = dashRes.status;
  const dashLocation = dashRes.headers.get('location');

  if (dashStatus === 200) {
    console.log('9. Dashboard /executive:   ✓ 200 OK');
  } else if (dashStatus === 307 || dashStatus === 302) {
    console.log(`9. Dashboard /executive:   REDIRECT → ${dashLocation}`);
    if (dashLocation?.includes('/login')) {
      console.log('   ✗ Redirected back to login (session not valid)');
    }
  } else {
    console.log(`9. Dashboard /executive:   ${dashStatus}`);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Founder Email:   cryptoaman9152@gmail.com');
  console.log(`Role:            ${roleName}`);
  console.log(`Status:          ${f.status}`);
  console.log(`2FA:             ${sessionToken ? 'configured & verified' : f.totp_enabled ? 'enabled' : 'pending setup'}`);
  console.log(`Session:         ${sessionToken ? '✓ ACTIVE' : '✗ NONE'}`);
  console.log(`Dashboard:       ${dashStatus === 200 ? '✓ ACCESSIBLE' : '✗ BLOCKED (' + dashStatus + ')'}`);
  console.log('═══════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
