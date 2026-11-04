import { NextResponse } from 'next/server';
import { getAuthenticatedStaff } from '@/lib/auth/get-staff';

function gone() {
  return NextResponse.json(
    {
      error: {
        code: 'PROMOTION_ENDPOINT_RETIRED',
        message: 'Per-plan discount configuration is retired. Use the campaign manager API.',
      },
    },
    { status: 410 },
  );
}

export async function GET() {
  const actor = await getAuthenticatedStaff();
  if (!actor || !actor.isFullAccess) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
      { status: 403 },
    );
  }
  return gone();
}

export async function PUT() {
  const actor = await getAuthenticatedStaff();
  if (!actor || !actor.isFullAccess) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Founder access required' } },
      { status: 403 },
    );
  }
  return gone();
}
