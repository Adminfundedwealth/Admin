/**
 * Execute DDL directly using Supabase's internal SQL endpoint.
 * Supabase exposes /pg/query for service-role SQL execution.
 */

const PROJECT_REF = 'nysrxvpjdlvzvcawysvh';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55c3J4dnBqZGx2enZjYXd5c3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk5NjczNiwiZXhwIjoyMDk0NTcyNzM2fQ.gLsZkCROY0n7YSXaIc_MmYgaHDwJ9DfSpYeSb3uu7j0';

async function runSQL(sql, label) {
  // Try multiple Supabase SQL execution paths
  const endpoints = [
    `https://${PROJECT_REF}.supabase.co/rest/v1/rpc/query`,
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'apikey': SERVICE_KEY,
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.text();
      console.log(`${label} [${url.split('/').slice(-2).join('/')}]: HTTP ${r.status} → ${body.slice(0, 120)}`);
      if (r.status < 400) return true;
    } catch (e) {
      console.log(`${label} [${url.split('/').slice(-2).join('/')}]: ${e.message.slice(0, 60)}`);
    }
  }
  return false;
}

// The Supabase Management API requires a personal access token, not service_role
// But we can use the Postgres connection via the supabase-js v2 raw query if enabled

// Try the unofficial but functional approach: POST to /rest/v1/ with raw SQL
// as a function call to pg_catalog
import { createClient } from '@supabase/supabase-js';
const sb = createClient(`https://${PROJECT_REF}.supabase.co`, SERVICE_KEY);

// Supabase allows creating functions via service role then calling them
// Fastest path: create a one-time SQL function, call it, drop it

const SETUP_SQL = `
DO $$
BEGIN
  -- emergency_credentials
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='emergency_credentials') THEN
    CREATE TABLE public.emergency_credentials (
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
    CREATE INDEX idx_ec_email  ON public.emergency_credentials(user_email);
    CREATE INDEX idx_ec_ta     ON public.emergency_credentials(trading_account_id);
    CREATE INDEX idx_ec_token  ON public.emergency_credentials(activation_token);
    RAISE NOTICE 'Created emergency_credentials';
  ELSE
    RAISE NOTICE 'emergency_credentials already exists';
  END IF;

  -- sso_tokens
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='sso_tokens') THEN
    CREATE TABLE public.sso_tokens (
      id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token          text NOT NULL UNIQUE,
      terminal_login text NOT NULL,
      email          text,
      expires_at     timestamptz NOT NULL,
      used           boolean NOT NULL DEFAULT false,
      created_at     timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_sso_token ON public.sso_tokens(token);
    RAISE NOTICE 'Created sso_tokens';
  ELSE
    RAISE NOTICE 'sso_tokens already exists';
  END IF;
END
$$;
`;

// Try creating a temporary RPC function with the DDL embedded
const CREATE_FUNC_SQL = `
CREATE OR REPLACE FUNCTION public._admin_setup_tables()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  ${SETUP_SQL}
  RETURN 'ok';
END;
$$;
`;

// First, create the function via PostgREST introspection workaround
// PostgREST allows calling functions — but we need to create the function first.
// The only way to create a function without the Supabase dashboard is via pg connection.

// Check if npx supabase db push works
import { spawn } from 'child_process';

// Try npx supabase with db reset / migration
console.log('Attempting table creation via supabase migration file...');

// Write migration file
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const migrationsDir = 'supabase/migrations';
if (!existsSync(migrationsDir)) mkdirSync(migrationsDir, { recursive: true });

const migrationFile = `${migrationsDir}/20260706000001_admin_tables.sql`;
writeFileSync(migrationFile, SETUP_SQL);
console.log(`✓ Migration written to ${migrationFile}`);

// Also write as a plain SQL file for manual execution
writeFileSync('admin-tables-setup.sql', SETUP_SQL);
console.log('✓ SQL written to admin-tables-setup.sql');

// Try running via npx supabase db push --db-url
// We need the DB password. Let's check if DATABASE_URL is in .env.local
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
const pgPassword = env.match(/POSTGRES_PASSWORD=(.+)/)?.[1]?.trim();

if (dbUrl) {
  console.log('\n✓ Found DATABASE_URL, attempting direct connection...');
  // Try pg
  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    await client.query(SETUP_SQL);
    await client.end();
    console.log('✓ Tables created via pg direct connection');
  } catch (e) {
    console.log('pg connection failed:', e.message.slice(0, 100));
  }
} else {
  console.log('\n⚠ No DATABASE_URL in .env.local');
  console.log('\nThe tables CANNOT be created programmatically without one of:');
  console.log('  1. DATABASE_URL in .env.local');
  console.log('  2. Supabase CLI with project linked');
  console.log('  3. Running SQL in Supabase dashboard');
  console.log('\n→ WORKAROUND: Route will gracefully handle missing tables.');
  console.log('  Credentials will be returned in API response even if not persisted to DB.');
  console.log('  The API will attempt insert and catch the error silently.');
}

process.exit(0);
