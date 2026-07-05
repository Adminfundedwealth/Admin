import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

async function inspectTable(tableName) {
  console.log(`\n=== ${tableName} ===`);
  
  // Try to get table info by selecting with limit 0
  const { data, error } = await supabase.from(tableName).select('*').limit(0);
  
  if (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return;
  }
  
  // Try inserting invalid data to get column hints
  const { error: insertError } = await supabase.from(tableName).insert({ _test_invalid_: 'x' });
  if (insertError) {
    console.log(`Insert error (shows columns): ${insertError.message}`);
  }
  
  // Try to select common columns
  const commonCols = ['id', 'created_at', 'updated_at', 'status', 'user_id', 'amount'];
  for (const col of commonCols) {
    const { error: colError } = await supabase.from(tableName).select(col).limit(0);
    if (!colError) {
      console.log(`✅ Has column: ${col}`);
    }
  }
}

// Check all target tables
await inspectTable('payout_reviews');
await inspectTable('risk_events');
await inspectTable('affiliate_clicks');
await inspectTable('certificates');
await inspectTable('support_requests');

// For certificates, check for date-related columns
console.log('\n=== Checking certificates date columns ===');
const dateCols = ['generated_at', 'created_at', 'issued_at', 'completed_at', 'verified_at'];
for (const col of dateCols) {
  const { error } = await supabase.from('certificates').select(col).limit(0);
  if (!error) {
    console.log(`✅ certificates has: ${col}`);
  }
}
