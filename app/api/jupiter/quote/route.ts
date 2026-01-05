import { NextRequest, NextResponse } from 'next/server';

/**
 * Jupiter Quote API Route
 * 
 * Calls Jupiter v1 /quote endpoint (current, not deprecated v6)
 * Source: https://dev.jup.ag/api-reference/swap/quote
 * 
 * No transaction execution. Read-only quote fetching.
 */

const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  
  const inputMint = searchParams.get('inputMint');
  const outputMint = searchParams.get('outputMint');
  const amount = searchParams.get('amount');
  const slippageBps = searchParams.get('slippageBps') || '50';
  
  // Validate required params
  if (!inputMint || !outputMint || !amount) {
    return NextResponse.json(
      { error: 'Missing required parameters: inputMint, outputMint, amount' },
      { status: 400 }
    );
  }

  // Get API key from environment
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { 
        error: 'JUPITER_API_KEY not configured',
        hint: 'Get API key from https://portal.jup.ag and add to .env.local'
      },
      { status: 500 }
    );
  }

  try {
    const url = new URL(JUPITER_QUOTE_URL);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount);
    url.searchParams.set('slippageBps', slippageBps);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { 
          error: 'Jupiter API error',
          status: response.status,
          details: errorText
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      success: true,
      quote: data,
      // Add summary for UI display
      summary: {
        inputMint: data.inputMint,
        outputMint: data.outputMint,
        inAmount: data.inAmount,
        outAmount: data.outAmount,
        slippageBps: data.slippageBps,
        priceImpactPct: data.priceImpactPct,
        routeSteps: data.routePlan?.length || 0,
      }
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to fetch quote',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
