import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const services = ['API Services', 'Database', 'WebSocket', 'Email Service', 'Payment Processor', 'Background Jobs'];
  
  for (const service of services) {
    const status = 'healthy'; // TODO: actual health checks
    const responseTime = Math.floor(Math.random() * 100) + 10;
    await supabase.from('system_health_checks').insert({ service_name: service, status, response_time_ms: responseTime });
  }
  
  return NextResponse.json({ success: true });
}
