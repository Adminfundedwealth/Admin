import { createClient } from '@supabase/supabase-js';
const s = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);

const { data, error } = await s.from('trading_accounts').select('*').limit(2);
if (error) { console.log('ERROR:', error.message); process.exit(0); }
if (data?.length) {
  console.log('COLUMNS:', Object.keys(data[0]).join(', '));
  console.log('SAMPLE:', JSON.stringify(data[0], null, 2));
} else {
  console.log('NO ROWS - checking via RPC');
}

// Also check provisioning_logs columns
const { data: pl } = await s.from('provisioning_logs').select('*').limit(1);
if (pl?.length) console.log('\nPROVISIONING_LOGS COLS:', Object.keys(pl[0]).join(', '));

// Check if emergency_credentials admin table exists
const { data: ec, error: ecErr } = await s.from('emergency_credentials').select('*').limit(1);
if (ecErr) console.log('\nemergency_credentials table:', ecErr.message);
else console.log('\nemergency_credentials table exists, cols:', ec?.length ? Object.keys(ec[0]).join(', ') : 'empty');

process.exit(0);
