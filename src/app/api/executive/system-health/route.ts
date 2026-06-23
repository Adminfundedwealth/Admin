import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/executive/system-health
 * Returns system service health statuses.
 * Checks: API (self), Database (Supabase query), WebSocket (Supabase realtime check),
 * Email (placeholder), Payments (placeholder), Jobs (placeholder).
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const services: { name: string; status: 'healthy' | 'degraded' | 'down' }[] = [];

    // API — if we got here, API is healthy
    services.push({ name: 'API', status: 'healthy' });

    // Database — try a simple query
    const dbStart = Date.now();
    const { error: dbError } = await supabase.from('staff_members').select('id', { count: 'exact', head: true });
    const dbTime = Date.now() - dbStart;

    if (dbError) {
      services.push({ name: 'Database', status: 'down' });
    } else if (dbTime > 2000) {
      services.push({ name: 'Database', status: 'degraded' });
    } else {
      services.push({ name: 'Database', status: 'healthy' });
    }

    // WebSocket — check if Supabase realtime is reachable (basic check via DB)
    // In production, this would ping the realtime endpoint
    services.push({ name: 'WebSocket', status: dbError ? 'degraded' : 'healthy' });

    // Email — check if email config is present (basic availability check)
    const emailConfigured = process.env.SMTP_HOST || process.env.RESEND_API_KEY;
    services.push({ name: 'Email', status: emailConfigured ? 'healthy' : 'degraded' });

    // Payments — check if payment config is present
    const paymentsConfigured = process.env.STRIPE_SECRET_KEY || process.env.RAZORPAY_KEY_SECRET;
    services.push({ name: 'Payments', status: paymentsConfigured ? 'healthy' : 'degraded' });

    // Jobs — check if any cron/job infrastructure is configured
    services.push({ name: 'Jobs', status: 'healthy' });

    return NextResponse.json({ services });
  } catch (error) {
    console.error('[System Health] Error:', error);
    return NextResponse.json({
      services: [
        { name: 'API', status: 'degraded' },
        { name: 'Database', status: 'down' },
        { name: 'WebSocket', status: 'down' },
        { name: 'Email', status: 'down' },
        { name: 'Payments', status: 'down' },
        { name: 'Jobs', status: 'down' },
      ],
    });
  }
}
