/**
 * Seed Founder account into the staff_members table.
 * Migrations must have been applied first.
 */
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = 'https://nysrxvpjdlvzvcawysvh.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function execSQL(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  if (error) {
    throw new Error(`SQL Error: ${error.message} | Details: ${error.details || 'none'} | Hint: ${error.hint || 'none'}`);
  }
  return data;
}

async function main() {
  const initialPassword = 'Founder@Admin2025!';
  const passwordHash = await bcrypt.hash(initialPassword, 12);
  
  console.log('=== Seeding Founder Account ===');
  console.log('  Email: cryptoaman9152@gmail.com');
  console.log('  Password hash generated (bcrypt, 12 rounds)');
  
  // Insert Founder account
  const insertFounderSQL = `
    INSERT INTO staff_members (id, email, name, password_hash, totp_enabled, status, failed_login_attempts)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'cryptoaman9152@gmail.com',
      'Founder',
      '${passwordHash}',
      false,
      'active',
      0
    )
    ON CONFLICT (email) DO NOTHING;
  `;
  
  await execSQL(insertFounderSQL);
  console.log('  ✓ Founder account inserted');
  
  // Assign Founder role
  const assignRoleSQL = `
    INSERT INTO staff_role_assignments (staff_id, role_id, assigned_by)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001'
    )
    ON CONFLICT (staff_id, role_id) DO NOTHING;
  `;
  
  await execSQL(assignRoleSQL);
  console.log('  ✓ Founder role assigned');
  
  // Verify
  const verifySQL = `SELECT id, email, name, status, totp_enabled FROM staff_members WHERE email = 'cryptoaman9152@gmail.com';`;
  await execSQL(verifySQL);
  console.log('  ✓ Verification query passed');
  
  console.log('\n=== Founder Account Ready ===');
  console.log('  Email: cryptoaman9152@gmail.com');
  console.log('  Password: ' + initialPassword);
  console.log('  Status: active');
  console.log('  TOTP: disabled (first login will require 2FA setup)');
  console.log('  Role: Founder');
}

main().catch(e => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
