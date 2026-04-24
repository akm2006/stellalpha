import { NextRequest, NextResponse } from 'next/server';
import { getOperatorAccess } from '@/lib/operator-auth';
import { deleteWebhookOnlyWallet } from '@/lib/star-trader-management/service';
import { StarTraderManagementError } from '@/lib/star-trader-management/types';
import { normalizeStarTraderWallet } from '@/lib/star-trader-management/validators';

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

  console.error('Operator star-trader orphan route error:', error);
  return NextResponse.json({ error: 'Operator orphan request failed' }, { status: 500 });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ wallet: string }> },
) {
  const access = await getOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { wallet } = await context.params;
    const normalizedWallet = normalizeStarTraderWallet(wallet);
    const result = await deleteWebhookOnlyWallet(normalizedWallet);
    return NextResponse.json({
      success: true,
      operatorWallet: access.operatorWallet,
      message: 'Webhook-only wallet removed',
      wallet: result.wallet,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
