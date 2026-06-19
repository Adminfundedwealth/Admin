import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client - uses service role key.
 * ONLY use in server-side code (API routes, server actions).
 * This client bypasses Row Level Security.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
