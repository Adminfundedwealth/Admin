export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { encrypt, isEncrypted } from '@/lib/security/encryption';

/**
 * GET /api/cron/migrate-totp
 * One-time migration: encrypt all plaintext TOTP secrets in the database.
 * 
 * SECURITY: Protected by CRON_SECRET in middleware.
 * Safe to run multiple times — skips already-encrypted values.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Fetch all staff with TOTP secrets
    const { data: staffList, error } = await supabase
      .from('staff_members')
      .select('id, totp_secret, totp_enabled')
      .not('totp_secret', 'is', null);

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_ERROR', message: error.message } },
        { status: 500 }
      );
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    for (const staff of staffList || []) {
      if (!staff.totp_secret) {
        skipped++;
        continue;
      }

      // Skip if already encrypted
      if (isEncrypted(staff.totp_secret)) {
        skipped++;
        continue;
      }

      try {
        const encryptedSecret = encrypt(staff.totp_secret);
        const { error: updateError } = await supabase
          .from('staff_members')
          .update({ totp_secret: encryptedSecret })
          .eq('id', staff.id);

        if (updateError) {
          failed++;
          console.error(`Failed to migrate TOTP for staff ${staff.id}:`, updateError.message);
        } else {
          migrated++;
        }
      } catch (err) {
        failed++;
        console.error(`Encryption error for staff ${staff.id}:`, err instanceof Error ? err.message : 'Unknown');
      }
    }

    return NextResponse.json({
      success: true,
      results: {
        total: (staffList || []).length,
        migrated,
        skipped,
        failed,
      },
    });
  } catch (err) {
    console.error('TOTP migration error:', err instanceof Error ? err.message : 'Unknown');
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Migration failed' } },
      { status: 500 }
    );
  }
}
