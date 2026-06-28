import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const newEmail = 'adminfundedwealth@gmail.com';
  const newPassword = 'Admin@FW2026!';
  const hash = await bcrypt.hash(newPassword, 12);

  console.log('=== Resetting Founder Access ===\n');

  // Update email, password, disable 2FA, unlock account
  const { data, error } = await supabase
    .from('staff_members')
    .update({
      email: newEmail,
      password_hash: hash,
      totp_enabled: false,
      totp_secret: null,
      status: 'active',
      failed_login_attempts: 0,
      locked_until: null,
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .select('id, email, status, totp_enabled');

  if (error) {
    console.error('ERROR:', error.message);
    process.exit(1);
  }

  console.log('✓ Founder account updated:', data);
  console.log('\n═══════════════════════════════════════');
  console.log('  Email:    ' + newEmail);
  console.log('  Password: ' + newPassword);
  console.log('  2FA:      DISABLED (will prompt setup on login)');
  console.log('  Status:   active');
  console.log('═══════════════════════════════════════');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
