import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

const tables = [
  { old: 'payout_requests', new: 'payout_reviews' },
  { old: 'risk_alerts', new: 'risk_events' },
  { old: 'affiliates', new: 'affiliate_clicks' },
  { old: 'certificates', new: 'certificates' }
];

for (const { old, new: newTable } of tables) {
  console.log(`\n=== ${old} → ${newTable} ===`);
  const { data, error } = await supabase.from(newTable).select('*').limit(1);
  
  if (error) {
    console.log(`❌ ERROR: ${error.message}`);
  } else {
    console.log(`✅ Table exists`);
    if (data && data.length > 0) {
      console.log(`Columns: ${Object.keys(data[0]).join(', ')}`);
      console.log(`Sample data: ${JSON.stringify(data[0], null, 2).substring(0, 300)}`);
    } else {
      console.log(`Empty table - trying to describe via error...`);
      const { error: e } = await supabase.from(newTable).insert({ invalid_column_test: 'test' });
      if (e) console.log(`Error hint: ${e.message}`);
    }
  }
}

// Check for support-related tables
console.log('\n=== Searching for support-related tables ===');
const supportVariants = ['support', 'ticket', 'help', 'inquiry', 'message'];
for (const variant of supportVariants) {
  for (const table of ['support_requests', 'tickets', 'help_requests', 'customer_support', 'inquiries']) {
    const { error } = await supabase.from(table).select('id', { head: true, count: 'exact' });
    if (!error) {
      console.log(`✅ Found: ${table}`);
    }
  }
}
