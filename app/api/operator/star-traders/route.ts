import { NextRequest, NextResponse } from 'next/server';
import { getOperatorAccess } from '@/lib/operator-auth';
import {
  createManagedStarTrader,
  listManagedStarTraders,
} from '@/lib/star-trader-management/service';
import { StarTraderManagementError } from '@/lib/star-trader-management/types';
import { normalizeStarTraderUpsertInput } from '@/lib/star-trader-management/validators';

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

  console.error('Operator star-trader route error:', error);
  return NextResponse.json({ error: 'Operator star-trader request failed' }, { status: 500 });
}

export async function GET() {
  const access = await getOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const data = await listManagedStarTraders();
    return NextResponse.json({
      operatorWallet: access.operatorWallet,
      traders: data.traders,
      webhookOnlyAddresses: data.webhookOnlyAddresses,
      supportsExtendedFields: data.supportsExtendedFields,
      webhookConfigured: data.webhookConfigured,
      webhookError: data.webhookError,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const access = await getOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const rawBody = await request.json();
    const input = normalizeStarTraderUpsertInput(rawBody);
    const result = await createManagedStarTrader(input);
    return NextResponse.json({
      success: true,
      operatorWallet: access.operatorWallet,
      trader: result.trader,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
