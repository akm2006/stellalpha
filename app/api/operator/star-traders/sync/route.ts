import { NextResponse } from 'next/server';
import { getOperatorAccess } from '@/lib/operator-auth';
import { syncWebhookToTrackedStarTraders } from '@/lib/star-trader-management/service';
import { StarTraderManagementError } from '@/lib/star-trader-management/types';

function toErrorResponse(error: unknown) {
  if (error instanceof StarTraderManagementError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details || null,
      },
      { status: error.status },
    );
  }

  console.error('Operator star-trader sync route error:', error);
  return NextResponse.json({ error: 'Operator star-trader sync failed' }, { status: 500 });
}

export async function POST() {
  const access = await getOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await syncWebhookToTrackedStarTraders();
    return NextResponse.json({
      success: true,
      operatorWallet: access.operatorWallet,
      ...result,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
