import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://nysrxvpjdlvzvcawysvh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0');

const tables = ['payout_requests', 'risk_alerts', 'support_tickets', 'certificates', 'affiliates'];

for (const table of tables) {
  const { data, error, count } = await supabase.from(table).select('id', { count: 'exact', head: true });
  console.log(`${table.padEnd(20)}: ${error ? '❌ ' + error.message : '✅ EXISTS (count: ' + (count || 0) + ')'}`);
}
