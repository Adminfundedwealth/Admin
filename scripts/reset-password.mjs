import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { TOTP } from 'otpauth';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function execSQL(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) throw new Error(error.message);
  return data;
}

async function query(sql) {
  const { data, error } = await supabase.rpc('query_sql', { sql_query: sql });
  if (error) throw new Error(error.message);
  return data;
}

async function main() {
  const newPassword = 'FundedWealth@2026!';
  const hash = await bcrypt.hash(newPassword, 12);

  // Update ONLY the Founder password
  console.log('1. Updating Founder password...');
  await execSQL(`UPDATE staff_members SET password_hash = '${hash}' WHERE email = 'cryptoaman9152@gmail.com'`);
  console.log('   ✓ Password hash updated');

  // Verify no other fields changed
  const staff = await query("SELECT id, email, status, totp_enabled, totp_secret FROM staff_members WHERE email = 'cryptoaman9152@gmail.com'");
  const f = staff[0];
  console.log(`   Status: ${f.status} | 2FA: ${f.totp_enabled} | Secret: ${f.totp_secret ? 'SET' : 'NULL'}`);

  // Test login with new password
  console.log('\n2. Testing login...');
  const loginRes = await fetch('http://localhost:4200/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'cryptoaman9152@gmail.com', password: newPassword }),
  });
  const loginData = await loginRes.json();
  console.log(`   POST /api/auth/login → ${loginRes.status}`);
  console.log(`   ${JSON.stringify(loginData)}`);
  if (loginRes.status !== 200) { console.log('   ✗ LOGIN FAILED'); process.exit(1); }
  console.log('   ✓ Login PASS');

  // Test 2FA
  console.log('\n3. Testing 2FA...');
  const totp = new TOTP({ secret: f.totp_secret, algorithm: 'SHA1', digits: 6, period: 30 });
  const code = totp.generate();
  const verifyRes = await fetch('http://localhost:4200/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, challengeToken: loginData.challengeToken }),
  });
  const verifyData = await verifyRes.json();
  const cookie = verifyRes.headers.get('set-cookie');
  console.log(`   POST /api/auth/2fa/verify → ${verifyRes.status}`);
  if (verifyRes.status !== 200 || !verifyData.success) { console.log('   ✗ 2FA FAILED'); process.exit(1); }
  console.log('   ✓ 2FA PASS');

  // Test dashboard
  console.log('\n4. Testing dashboard...');
  const sessionToken = cookie?.split('session_token=')[1]?.split(';')[0];
  const dashRes = await fetch('http://localhost:4200/executive', {
    headers: { 'Cookie': `session_token=${sessionToken}` },
    redirect: 'manual',
  });
  console.log(`   GET /executive → ${dashRes.status}`);
  if (dashRes.status !== 200) { console.log('   ✗ DASHBOARD FAILED'); process.exit(1); }
  console.log('   ✓ Dashboard PASS');

  // Final output
  console.log('\n═══════════════════════════════════════');
  console.log('Founder Email:      cryptoaman9152@gmail.com');
  console.log('Password Updated:   YES');
  console.log('Login:              PASS');
  console.log('2FA:                PASS');
  console.log('Dashboard:          PASS');
  console.log('═══════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
