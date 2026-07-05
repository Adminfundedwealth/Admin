import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

// Query the Supabase metadata to list all tables
const { data, error } = await supabase
  .rpc('exec_sql', { 
    sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;` 
  });

if (error) {
  console.log('RPC not available, trying alternative...');
  
  // Try common tables from the shared schema
  const commonTables = [
    'users', 'staff', 'challenges', 'payments', 'funded_accounts',
    'payout_reviews', 'risk_events', 'certificates', 'affiliate_clicks',
    'kyc_submissions', 'audit_logs', 'sessions', 'two_factor_auth',
    'user_notes', 'challenge_logs', 'payment_logs', 'provisioning_logs'
  ];
  
  console.log('\n=== Testing common tables ===');
  for (const table of commonTables) {
    const { error } = await supabase.from(table).select('id').limit(0);
    if (!error) {
      console.log(`✅ ${table}`);
    }
  }
} else {
  console.log('All tables:', data);
}
