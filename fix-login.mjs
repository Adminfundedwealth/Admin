import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);

// List all staff members
const { data: allStaff, error } = await supabase
  .from('staff_members')
  .select('id, email, name, status, totp_enabled, failed_login_attempts, locked_until');

if (error) { console.log('Error:', error.message); process.exit(1); }

console.log('All staff members:');
console.log(JSON.stringify(allStaff, null, 2));

// Update all founder/admin accounts
const PASSWORD = 'Founder@Admin2025!';
const newHash = await bcrypt.hash(PASSWORD, 12);
const hashOk = await bcrypt.compare(PASSWORD, newHash);
console.log(`\nHash verify: ${hashOk}`);

for (const s of allStaff || []) {
  const { error: upErr } = await supabase
    .from('staff_members')
    .update({
      password_hash: newHash,
      status: 'active',
      failed_login_attempts: 0,
      locked_until: null,
      force_password_change: false,
      totp_enabled: false,
    })
    .eq('id', s.id);
  console.log(`Updated ${s.email}: ${upErr ? upErr.message : 'ok'}`);
}

process.exit(0);
