/**
 * Creates tables using pg direct connection via Supabase transaction pooler.
 * Supabase pooler URL: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 * We'll try to find the connection string from env or construct it.
 */

// Supabase direct DB connection (transaction pooler)
// Format: postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
// We don't have the DB password in .env.local, only the service role JWT.
// 
// Alternative: use the Supabase JS client with a workaround — insert a dummy row
// that will fail, but we can catch the "relation does not exist" vs other errors.
// 
// BEST APPROACH: The service_role key CAN execute arbitrary SQL via the Supabase 
// postgres REST extension if it's enabled. Let's try /rest/v1/rpc pattern with
// the postgres extension, OR create a Supabase migration file and run it via CLI.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nysrxvpjdlvzvcawysvh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0'
);

// Try using supabase.auth.admin to confirm service role works
const { data: { users }, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1 });
if (authErr) {
  console.log('Auth admin check:', authErr.message);
} else {
  console.log('✓ Service role confirmed (auth admin works)');
}

// Check if npx supabase is available
import { execSync } from 'child_process';
try {
  const ver = execSync('npx supabase --version 2>&1', { timeout: 8000 }).toString().trim();
  console.log('Supabase CLI:', ver);
} catch (e) {
  console.log('Supabase CLI not available:', e.message.slice(0, 80));
}

// Print the exact SQL that needs to be run
console.log('\n' + '═'.repeat(60));
console.log('RUN THIS SQL IN SUPABASE DASHBOARD > SQL EDITOR:');
console.log('https://supabase.com/dashboard/project/nysrxvpjdlvzvcawysvh/sql/new');
console.log('═'.repeat(60));
console.log(`
-- Admin-owned table for emergency provision credentials
CREATE TABLE IF NOT EXISTS public.emergency_credentials (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_account_id   uuid,
  challenge_account_id uuid,
  user_id              uuid,
  user_email           text NOT NULL,
  terminal_login       text NOT NULL,
  temporary_password   text NOT NULL,
  activation_token     text NOT NULL UNIQUE,
  credential_expiry    timestamptz NOT NULL,
  product_slug         text NOT NULL,
  account_size         bigint NOT NULL,
  provisioned_by       text NOT NULL DEFAULT 'founder_emergency',
  provisioned_at       timestamptz NOT NULL DEFAULT now(),
  used                 boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ec_email  ON public.emergency_credentials(user_email);
CREATE INDEX IF NOT EXISTS idx_ec_ta     ON public.emergency_credentials(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_ec_token  ON public.emergency_credentials(activation_token);

-- SSO tokens for terminal launch auto-login
CREATE TABLE IF NOT EXISTS public.sso_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text NOT NULL UNIQUE,
  terminal_login text NOT NULL,
  email          text,
  expires_at     timestamptz NOT NULL,
  used           boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sso_token ON public.sso_tokens(token);
`);
console.log('═'.repeat(60));

process.exit(0);
