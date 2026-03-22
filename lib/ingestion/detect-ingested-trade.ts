import { getSolPrice } from '@/lib/services/token-service';
import { BASE_MINTS, detectTrade as detectTradeParser, getUsdValueSync, RawTrade, WSOL } from '@/lib/trade-parser';
import { adaptShyftParsedTx } from '@/lib/ingestion/shyft-adapter';

const SOL_LITERAL = 'SOL';

function isSolLikeMint(mint: string) {
  return mint === SOL_LITERAL || mint === WSOL;
}

function inferConfidence(trade: {
  tokenInMint: string;
  tokenOutMint: string;
}): RawTrade['confidence'] {
  const inputIsBase = BASE_MINTS.has(trade.tokenInMint) || trade.tokenInMint === SOL_LITERAL;
  const outputIsBase = BASE_MINTS.has(trade.tokenOutMint) || trade.tokenOutMint === SOL_LITERAL;

  if (inputIsBase && outputIsBase) {
    return 'medium';
  }

  if (inputIsBase || outputIsBase) {
    return 'high';
  }

  return 'low';
}

function adaptShyftParsedTxToRawTrade(parsed: any, wallet: string, solPrice: number): RawTrade | null {
  const adapted = adaptShyftParsedTx(parsed, wallet);
  if (!adapted.parsed) {
    return null;
  }

  const baseMint = adapted.parsed.type === 'buy' ? adapted.parsed.tokenInMint : adapted.parsed.tokenOutMint;
  const baseTokenAmount = adapted.parsed.type === 'buy' ? adapted.parsed.tokenInAmount : adapted.parsed.tokenOutAmount;
  const baseAmount =
    adapted.parsed.baseAmount ??
    (isSolLikeMint(baseMint) ? getUsdValueSync(SOL_LITERAL, baseTokenAmount, solPrice) : 0);

  return {
    signature: adapted.parsed.signature,
    wallet: adapted.parsed.wallet,
    type: adapted.parsed.type,
    tokenMint: adapted.parsed.tokenMint,
    tokenAmount: adapted.parsed.tokenAmount,
    baseAmount,
    tokenInMint: adapted.parsed.tokenInMint,
    tokenInAmount: adapted.parsed.tokenInAmount,
    tokenInPreBalance: 0,
    tokenOutMint: adapted.parsed.tokenOutMint,
    tokenOutAmount: adapted.parsed.tokenOutAmount,
    timestamp: adapted.parsed.timestamp ?? Math.floor(Date.now() / 1000),
    source: 'SHYFT',
    gas: adapted.parsed.gas ?? 0,
    confidence: inferConfidence(adapted.parsed),
  };
}

export async function detectIngestedTrade(
  tx: any,
  wallet: string,
  options?: { solPrice?: number }
): Promise<RawTrade | null> {
  if (tx?.__parsedProvider === 'shyft') {
    const solPrice = options?.solPrice ?? await getSolPrice();
    return adaptShyftParsedTxToRawTrade(tx, wallet, solPrice);
  }

  const solPrice = options?.solPrice ?? await getSolPrice();
  return detectTradeParser(tx, wallet, solPrice);
}
