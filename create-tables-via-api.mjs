/**
 * Creates admin-owned tables via Supabase REST + pg connection.
 * Project: nysrxvpjdlvzvcawysvh
 */

const PROJECT_REF = 'nysrxvpjdlvzvcawysvh';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0';

// Use Supabase's pg-meta SQL endpoint  
const SQL_ENDPOINT = `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/`;

// Try the Supabase SQL API directly
async function runSQL(sql) {
  const res = await fetch(`https://${PROJECT_REF}.supabase.co/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

// Try via pg-meta
async function runSQLViaMeta(sql) {
  const res = await fetch(`https://${PROJECT_REF}.supabase.co/pg-meta/v1/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  return { status: res.status, body: await res.text() };
}

const DDL_EMERGENCY_CREDENTIALS = `
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
CREATE INDEX IF NOT EXISTS idx_ec_email   ON public.emergency_credentials(user_email);
CREATE INDEX IF NOT EXISTS idx_ec_ta      ON public.emergency_credentials(trading_account_id);
CREATE INDEX IF NOT EXISTS idx_ec_token   ON public.emergency_credentials(activation_token);
`;

const DDL_SSO_TOKENS = `
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
`;

console.log('Trying pg-meta SQL endpoint...');

for (const [label, sql] of [['emergency_credentials', DDL_EMERGENCY_CREDENTIALS], ['sso_tokens', DDL_SSO_TOKENS]]) {
  const r = await runSQLViaMeta(sql);
  console.log(`${label}: HTTP ${r.status} → ${r.body.slice(0, 120)}`);
}

process.exit(0);
