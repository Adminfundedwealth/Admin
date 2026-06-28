export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';
import { z } from 'zod';

const noteSchema = z.object({
  body: z.string().min(10, 'Note must be at least 10 characters').max(5000, 'Note must not exceed 5000 characters'),
  category: z.enum(['general', 'compliance', 'support', 'risk', 'finance']),
});

/**
 * POST /api/users/[id]/notes
 * Add an internal staff note to a user profile.
 * Requires min 10 chars, max 5000 chars.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const parsed = noteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Authenticate staff
    const staff = await getAuthenticatedStaff();
    if (!staff) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const staffId = staff.id;

    const { data, error } = await supabase
      .from('user_notes')
      .insert({
        user_id: params.id,
        author_id: staffId,
        category: parsed.data.category,
        body: parsed.data.body,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: { code: 'INSERT_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    console.error('Add note error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to add note' } },
      { status: 500 }
    );
  }
}
