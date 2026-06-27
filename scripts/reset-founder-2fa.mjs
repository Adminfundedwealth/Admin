import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Reset Founder to pre-2FA state for manual testing
const { error } = await supabase.rpc('exec_sql', {
  sql_query: `
    UPDATE staff_members 
    SET totp_enabled = false, totp_secret = NULL 
    WHERE id = '00000000-0000-0000-0000-000000000001';
    
    DELETE FROM staff_sessions 
    WHERE staff_id = '00000000-0000-0000-0000-000000000001';
  `
});

if (error) {
  console.error('Error:', error.message);
} else {
  console.log('✓ Founder 2FA reset. Next login will require 2FA setup.');
}
