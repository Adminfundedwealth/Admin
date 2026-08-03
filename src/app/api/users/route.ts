export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requirePermissionInHandler } from '@/lib/security/require-auth';
import { sanitizeSearchInput } from '@/lib/security/sanitize';

/**
 * GET /api/users
 * List/search/filter users with pagination.
 *
 * LIVE SCHEMA (verified):
 *   users: id(uuid), clerk_id, email, first_name, last_name, phone, city, state, avatar_url,
 *     role, affiliate_code, referred_by, notification_settings, kyc_status, is_active, risk_score,
 *     risk_level, account_status, experience_points, current_level, achievement_count, streak_points,
 *     public_profile, total_payout, upi_id, bank_account_name, bank_account_number, bank_ifsc_code,
 *     bank_name, preferred_payout_method, created_at, updated_at
 *
 * NOTE: No `username` or `country` column exists. Use `city`/`state` for location filtering.
 */
export async function GET(request: NextRequest) {
  try {
    // Defense-in-depth auth
    const { error: authError } = await requirePermissionInHandler('users.view');
    if (authError) return authError;

    const supabase = createAdminClient();
    const params = request.nextUrl.searchParams;
    const rawSearch = params.get('search');
    const search = rawSearch ? sanitizeSearchInput(rawSearch) : null;
    const kycStatus = params.get('kyc_status');
    const accountStatus = params.get('account_status');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');
    const rawLocation = params.get('location') || params.get('country');
    const location = rawLocation ? sanitizeSearchInput(rawLocation) : null;
    const page = parseInt(params.get('page') || '1', 10);
    const pageSize = Math.min(parseInt(params.get('page_size') || '20', 10), 100);
    const offset = (page - 1) * pageSize;

    // Select only columns that exist in live schema
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, phone, city, state, kyc_status, account_status, is_active, created_at', { count: 'exact' });

    // Search (partial match, min 3 chars) — sanitized input
    if (search && search.length >= 3) {
      query = query.or(
        `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,id.eq.${search}`
      );
    }

    // Filters — live columns only
    if (kycStatus) query = query.eq('kyc_status', kycStatus);
    if (accountStatus) query = query.eq('account_status', accountStatus);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');
    if (location && location.length >= 2) {
      query = query.or(`city.ilike.%${location}%,state.ilike.%${location}%`);
    }

    // Pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: data || [],
      meta: {
        page,
        pageSize,
        totalCount: count ?? 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (err) {
    console.error('Users list error:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch users' } },
      { status: 500 }
    );
  }
}
