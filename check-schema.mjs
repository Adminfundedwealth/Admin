import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

console.log('=== Checking Database Schema ===\n');

// Check if tables exist and their structure
const tables = ['payout_requests', 'risk_alerts', 'support_tickets', 'certificates', 'affiliates'];

for (const table of tables) {
  console.log(`\n--- ${table} ---`);
  const { data, error } = await supabase.from(table).select('*').limit(1);
  
  if (error) {
    console.log(`❌ ERROR: ${error.message}`);
    console.log(`   Code: ${error.code}`);
    console.log(`   Hint: ${error.hint || 'none'}`);
  } else {
    console.log(`✅ Table exists`);
    if (data && data.length > 0) {
      console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
    } else {
      console.log(`   Columns: (empty - checking with insert...)`);
      // Try to get column structure from error
      const { error: insertError } = await supabase.from(table).insert({});
      if (insertError) {
        console.log(`   Insert error: ${insertError.message}`);
      }
    }
  }
}

// Also check what tables are accessible
console.log('\n=== Attempting to list all accessible tables ===');
const allTables = ['users', 'orders', 'challenge_accounts', 'trading_accounts', 'staff_members', 'roles', 'staff_role_assignments'];
for (const t of allTables) {
  const { error } = await supabase.from(t).select('id', { count: 'exact', head: true });
  if (!error) {
    console.log(`✅ ${t}`);
  }
}
