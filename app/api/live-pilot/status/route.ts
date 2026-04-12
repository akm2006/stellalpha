import { NextResponse } from 'next/server';
import { getLivePilotOperatorAccess } from '@/lib/live-pilot/auth';
import { getLivePilotStatus } from '@/lib/live-pilot/status';

export const dynamic = 'force-dynamic';

export async function GET() {
  const access = await getLivePilotOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const status = await getLivePilotStatus(access.operatorWallet, access.config);
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Failed to load live-pilot status',
        hint: 'Apply migrations/live-pilot-foundation.sql and verify the pilot_* tables exist in Supabase.',
      },
      { status: 500 }
    );
  }
}
