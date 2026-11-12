export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auditLogger } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';

const announcementSchema = z.object({
  title: z.string().trim().min(1).max(150),
  content: z.string().trim().min(1).max(5000),
  target_audience: z.enum(['all_users', 'active_traders', 'funded_traders', 'affiliates']),
  start_date: z.string().datetime({ offset: true }),
  end_date: z.string().datetime({ offset: true }),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
}).superRefine((announcement, context) => {
  if (new Date(announcement.end_date).getTime() <= new Date(announcement.start_date).getTime()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be later than start date',
      path: ['end_date'],
    });
  }
});

function isMissingAnnouncementsTable(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205'
    || error.code === '42P01'
    || error.message?.includes("Could not find the table 'public.announcements'") === true;
}

function storageError(error: { code?: string; message?: string }) {
  console.error('Announcements database request failed:', error.code, error.message);
  if (isMissingAnnouncementsTable(error)) {
    return NextResponse.json(
      { error: { code: 'ANNOUNCEMENTS_NOT_CONFIGURED', message: 'Announcements storage is not available. Apply the Admin announcements schema migration.' } },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: { code: 'ANNOUNCEMENTS_QUERY_FAILED', message: 'Announcements could not be loaded or saved.' } },
    { status: 500 },
  );
}

export async function GET() {
  const { error: authError } = await requirePermissionInHandler('marketing.view');
  if (authError) return authError;

  const { data, error } = await createAdminClient()
    .from('announcements')
    .select('id, title, content, target_audience, start_date, end_date, priority, created_by, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return storageError(error);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: NextRequest) {
  const { staff, error: authError } = await requirePermissionInHandler('marketing.manage');
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Request body must be valid JSON.' } },
      { status: 400 },
    );
  }

  const parsed = announcementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Announcement details are invalid.' } },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await createAdminClient()
    .from('announcements')
    .insert({
      ...parsed.data,
      created_by: staff.id,
      created_at: now,
      updated_at: now,
    })
    .select('id, title, content, target_audience, start_date, end_date, priority, created_by, created_at, updated_at')
    .single();

  if (error || !data) {
    return storageError(error || { message: 'Announcement insert returned no row.' });
  }

  let auditWarning: string | undefined;
  try {
    await auditLogger.log({
      actorId: staff.id,
      actorRole: staff.roles[0] || 'staff',
      action: 'announcement.create',
      targetEntityType: 'announcement',
      targetEntityId: data.id,
      newState: parsed.data,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      deviceInfo: {
        fingerprint: 'announcement-create',
        browser: request.headers.get('user-agent') || 'unknown',
        os: 'server',
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1',
      },
    });
  } catch (error) {
    console.error('Announcement was created but its audit record failed:', error);
    auditWarning = 'Announcement was created, but its audit record could not be saved.';
  }

  return NextResponse.json({ data, ...(auditWarning ? { warning: auditWarning } : {}) }, { status: 201 });
}
