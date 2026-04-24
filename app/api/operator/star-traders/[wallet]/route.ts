import { NextRequest, NextResponse } from 'next/server';
import { getOperatorAccess } from '@/lib/operator-auth';
import {
  deleteManagedStarTrader,
  updateManagedStarTrader,
} from '@/lib/star-trader-management/service';
import { StarTraderManagementError } from '@/lib/star-trader-management/types';
import {
  normalizeStarTraderUpsertInput,
  normalizeStarTraderWallet,
} from '@/lib/star-trader-management/validators';

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

  console.error('Operator star-trader wallet route error:', error);
  return NextResponse.json({ error: 'Operator star-trader request failed' }, { status: 500 });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ wallet: string }> },
) {
  const access = await getOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { wallet } = await context.params;
    const normalizedWallet = normalizeStarTraderWallet(wallet);
    const rawBody = await request.json();
    const input = normalizeStarTraderUpsertInput(rawBody);
    if (input.wallet && input.wallet !== normalizedWallet) {
      return NextResponse.json(
        { error: 'Wallet address cannot be changed from the edit route' },
        { status: 400 },
      );
    }

    const result = await updateManagedStarTrader(normalizedWallet, input);
    return NextResponse.json({
      success: true,
      operatorWallet: access.operatorWallet,
      trader: result.trader,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
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
    const result = await deleteManagedStarTrader(normalizedWallet);
    return NextResponse.json({
      success: true,
      operatorWallet: access.operatorWallet,
      message: 'Star trader removed from database and webhook tracking',
      wallet: result.wallet,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
