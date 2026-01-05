import { NextRequest, NextResponse } from 'next/server';

/**
 * Jupiter Swap-Instructions API Route
 * 
 * Calls Jupiter v1 /swap-instructions endpoint (current, not deprecated v6)
 * Source: https://dev.jup.ag/api-reference/swap/swap-instructions
 * 
 * Returns instruction data and account metas with signer/writable flags.
 * No transaction execution.
 */

const JUPITER_SWAP_INSTRUCTIONS_URL = 'https://api.jup.ag/swap/v1/swap-instructions';

interface AccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface Instruction {
  programId: string;
  accounts: AccountMeta[];
  data: string;
}

interface SwapInstructionsResponse {
  otherInstructions?: Instruction[];
  computeBudgetInstructions?: Instruction[];
  setupInstructions?: Instruction[];
  swapInstruction: Instruction;
  cleanupInstruction?: Instruction;
  addressLookupTableAddresses?: string[];
}

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { quoteResponse, authorityPublicKey } = body;

  // Validate required params
  if (!quoteResponse || !authorityPublicKey) {
    return NextResponse.json(
      { 
        error: 'Missing required parameters: quoteResponse, authorityPublicKey',
        hint: 'authorityPublicKey is the TraderState PDA that will sign via invoke_signed'
      },
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
    const response = await fetch(JUPITER_SWAP_INSTRUCTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        // NOTE: Jupiter uses 'userPublicKey' but for StellAlpha this is the TraderState PDA
        // which will sign via invoke_signed, NOT a user wallet
        userPublicKey: authorityPublicKey,
        quoteResponse,
        // Use shared accounts for simpler routing (no intermediate ATAs needed)
        useSharedAccounts: true,
        // Don't wrap/unwrap SOL automatically - StellAlpha handles this
        wrapAndUnwrapSol: false,
        // Use versioned transactions for efficiency
        asLegacyTransaction: false,
        // Let Jupiter handle compute budget
        dynamicComputeUnitLimit: true,
      }),
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

    const data: SwapInstructionsResponse = await response.json();
    
    // Annotate accounts with role analysis for StellAlpha integration
    const annotatedAccounts = data.swapInstruction.accounts.map((acc, index) => ({
      ...acc,
      index,
      role: analyzeAccountRole(acc, authorityPublicKey),
    }));

    // Find signers and writable accounts
    const signerAccounts = annotatedAccounts.filter(a => a.isSigner);
    const writableAccounts = annotatedAccounts.filter(a => a.isWritable);

    return NextResponse.json({
      success: true,
      
      // Main swap instruction with annotated accounts
      swapInstruction: {
        programId: data.swapInstruction.programId,
        accounts: annotatedAccounts,
        data: data.swapInstruction.data,
        dataLength: data.swapInstruction.data.length,
      },
      
      // Summary for quick analysis
      summary: {
        totalAccounts: annotatedAccounts.length,
        signerCount: signerAccounts.length,
        writableCount: writableAccounts.length,
        signers: signerAccounts.map(a => ({ pubkey: a.pubkey, role: a.role })),
        programId: data.swapInstruction.programId,
        hasLookupTables: (data.addressLookupTableAddresses?.length || 0) > 0,
        lookupTableCount: data.addressLookupTableAddresses?.length || 0,
      },

      // Address Lookup Tables for versioned transactions
      addressLookupTableAddresses: data.addressLookupTableAddresses || [],

      // Other instructions (setup, cleanup, compute budget)
      otherInstructions: {
        setup: data.setupInstructions?.length || 0,
        cleanup: data.cleanupInstruction ? 1 : 0,
        computeBudget: data.computeBudgetInstructions?.length || 0,
      },

      // Raw data for advanced inspection
      raw: data,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        error: 'Failed to fetch swap instructions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * Analyze account role for StellAlpha integration
 */
function analyzeAccountRole(acc: AccountMeta, authorityPublicKey: string): string {
  if (acc.pubkey === authorityPublicKey) {
    return 'AUTHORITY (TraderState PDA - signs via invoke_signed)';
  }
  if (acc.isSigner && acc.isWritable) {
    return 'SIGNER+WRITABLE';
  }
  if (acc.isSigner) {
    return 'SIGNER';
  }
  if (acc.isWritable) {
    return 'WRITABLE';
  }
  return 'READ-ONLY';
}
