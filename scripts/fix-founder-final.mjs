import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { TOTP } from 'otpauth';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const email = 'adminfundedwealth@gmail.com';
  const password = 'Admin@FW2026!';
  const hash = await bcrypt.hash(password, 12);

  // Generate a TOTP secret for 2FA
  const totpSecret = new TOTP({
    issuer: 'FundedWealth Admin',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  // Generate random secret
  const secretBytes = new Uint8Array(20);
  crypto.getRandomValues(secretBytes);
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let secret = '';
  for (let i = 0; i < secretBytes.length; i++) {
    secret += base32Chars[secretBytes[i] % 32];
  }

  console.log('=== Final Founder Reset ===\n');

  // First check if the account exists
  const { data: existing } = await supabase
    .from('staff_members')
    .select('id, email, status, totp_enabled')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .single();

  console.log('Current state:', existing);

  // Update everything
  const { data, error } = await supabase
    .from('staff_members')
    .update({
      email: email,
      password_hash: hash,
      totp_enabled: true,
      totp_secret: secret,
      status: 'active',
      failed_login_attempts: 0,
      locked_until: null,
      force_password_change: false,
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .select('id, email, status, totp_enabled');

  if (error) {
    console.error('UPDATE ERROR:', error.message);
    process.exit(1);
  }

  console.log('\n✓ Account updated:', data);

  // Generate the QR code URL
  const otpauthUrl = `otpauth://totp/FundedWealth%20Admin:${email}?secret=${secret}&issuer=FundedWealth%20Admin&algorithm=SHA1&digits=6&period=30`;

  // Generate a current TOTP code for immediate testing
  const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });
  const currentCode = totp.generate();

  console.log('\n═══════════════════════════════════════');
  console.log('  Email:       ' + email);
  console.log('  Password:    ' + password);
  console.log('  2FA Secret:  ' + secret);
  console.log('  2FA Enabled: YES');
  console.log('  Status:      active');
  console.log('');
  console.log('  OTPAuth URL (for authenticator app):');
  console.log('  ' + otpauthUrl);
  console.log('');
  console.log('  Current TOTP code (valid ~30s): ' + currentCode);
  console.log('═══════════════════════════════════════');
  console.log('');
  console.log('Add the secret to Google Authenticator or any TOTP app.');
  console.log('Then login with email + password, and enter the 6-digit code.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
