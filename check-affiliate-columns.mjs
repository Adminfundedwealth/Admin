import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

console.log('=== Checking affiliate_clicks columns ===');

const cols = ['id', 'created_at', 'clicked_at', 'timestamp', 'status', 'user_id', 'affiliate_id', 'click_date'];
for (const col of cols) {
  const { error } = await supabase.from('affiliate_clicks').select(col).limit(0);
  if (!error) {
    console.log(`✅ Has: ${col}`);
  }
}
