/**
 * Creates the admin-owned emergency_credentials table in Supabase.
 * This is an admin-only table — Terminal does NOT own it.
 * Stores generated credentials for emergency-provisioned accounts.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);

// Use Supabase REST API to execute raw SQL via the postgres extension
// We'll use the rpc call to run DDL
const createTableSQL = `
CREATE TABLE IF NOT EXISTS public.emergency_credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id  UUID REFERENCES public.trading_accounts(id) ON DELETE CASCADE,
  challenge_account_id UUID,
  user_id             UUID,
  user_email          TEXT NOT NULL,
  terminal_login      TEXT NOT NULL,
  temporary_password  TEXT NOT NULL,
  activation_token    TEXT NOT NULL UNIQUE,
  credential_expiry   TIMESTAMPTZ NOT NULL,
  product_slug        TEXT NOT NULL,
  account_size        BIGINT NOT NULL,
  provisioned_by      TEXT NOT NULL DEFAULT 'founder_emergency',
  provisioned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  used                BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emergency_credentials_user_email ON public.emergency_credentials(user_email);
CREATE INDEX IF NOT EXISTS idx_emergency_credentials_trading_account ON public.emergency_credentials(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_emergency_credentials_token ON public.emergency_credentials(activation_token);

CREATE TABLE IF NOT EXISTS public.sso_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT NOT NULL UNIQUE,
  terminal_login TEXT NOT NULL,
  email         TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sso_tokens_token ON public.sso_tokens(token);
`;

console.log('Creating emergency_credentials and sso_tokens tables...');

const { data, error } = await supabase.rpc('exec_sql', { sql: createTableSQL });

if (error) {
  // RPC may not exist — try direct query approach
  console.log('RPC exec_sql not available:', error.message);
  console.log('\nFalling back to individual table creation...');

  // Try inserting a test row to check if table already exists
  const { error: testErr } = await supabase
    .from('emergency_credentials')
    .select('id')
    .limit(1);

  if (testErr && testErr.message.includes('does not exist')) {
    console.log('\nTable does not exist. Running SQL via Supabase dashboard is required.');
    console.log('\nCopy and run this SQL in Supabase SQL Editor:');
    console.log('━'.repeat(60));
    console.log(createTableSQL);
    console.log('━'.repeat(60));
  } else if (!testErr) {
    console.log('✓ emergency_credentials table already exists');
  } else {
    console.log('Error checking table:', testErr.message);
  }
} else {
  console.log('✓ Tables created successfully');
}

// Verify sso_tokens
const { error: ssoErr } = await supabase.from('sso_tokens').select('id').limit(1);
if (ssoErr) {
  console.log('sso_tokens table:', ssoErr.message);
} else {
  console.log('✓ sso_tokens table accessible');
}

process.exit(0);
