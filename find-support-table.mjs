import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

const supportTables = ['tickets', 'help_requests', 'customer_support', 'inquiries', 'support_tickets'];

for (const table of supportTables) {
  console.log(`\n=== Checking ${table} ===`);
  const { data, error } = await supabase.from(table).select('*').limit(0);
  if (!error) {
    console.log(`✅ Table exists`);
    
    // Check for common columns
    const cols = ['id', 'status', 'priority', 'created_at', 'user_id', 'subject', 'message'];
    for (const col of cols) {
      const { error: colError } = await supabase.from(table).select(col).limit(0);
      if (!colError) {
        console.log(`  ✅ Has: ${col}`);
      }
    }
  } else {
    console.log(`❌ ${error.message}`);
  }
}
