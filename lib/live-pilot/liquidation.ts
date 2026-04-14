import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { Connection } from '@solana/web3.js';
import type { LivePilotWalletConfig } from '@/lib/live-pilot/config';
import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { listActiveLiquidationTrades, createPilotTrade } from '@/lib/live-pilot/repositories/pilot-trades.repo';
import { updatePilotRuntimeState } from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import { getSolPrice, getTokenSymbol } from '@/lib/services/token-service';

const DUST_SOL_VALUE_THRESHOLD = 0.001;
const JUPITER_API_KEY = process.env.JUPITER_API_KEY?.trim() || '';
const WSOL = 'So11111111111111111111111111111111111111112';

interface TokenHolding {
  mint: string;
  rawAmount: string;
  uiAmount: number;
  decimals: number;
}

function rawToUi(rawAmount: bigint, decimals: number) {
  return Number(rawAmount) / Math.pow(10, decimals);
}

async function getWalletTokenHoldings(connection: Connection, walletPublicKey: string) {
  const owner = new PublicKey(walletPublicKey);
  const responses = await Promise.all([
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, 'confirmed'),
    connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }, 'confirmed'),
  ]);

  const byMint = new Map<string, { rawAmount: bigint; decimals: number }>();

  for (const response of responses) {
    for (const entry of response.value) {
      const parsedInfo = (entry.account.data as any)?.parsed?.info;
      const mint = parsedInfo?.mint as string | undefined;
      const tokenAmount = parsedInfo?.tokenAmount;

      if (!mint || !tokenAmount?.amount) {
        continue;
      }

      const current = byMint.get(mint) || { rawAmount: BigInt(0), decimals: tokenAmount.decimals ?? 0 };
      current.rawAmount += BigInt(tokenAmount.amount);
      current.decimals = tokenAmount.decimals ?? current.decimals;
      byMint.set(mint, current);
    }
  }

  return Array.from(byMint.entries())
    .filter(([mint, holding]) => mint !== WSOL && holding.rawAmount > BigInt(0))
    .map(([mint, holding]) => ({
      mint,
      rawAmount: holding.rawAmount.toString(),
      uiAmount: rawToUi(holding.rawAmount, holding.decimals),
      decimals: holding.decimals,
    })) as TokenHolding[];
}

async function fetchUsdPrices(mints: string[]) {
  if (mints.length === 0) {
    return {} as Record<string, number>;
  }

  const headers: Record<string, string> = {};
  if (JUPITER_API_KEY) {
    headers['x-api-key'] = JUPITER_API_KEY;
  }

  try {
    const response = await fetch(`https://api.jup.ag/price/v3?ids=${mints.join(',')}`, { headers });
    if (!response.ok) {
      return {} as Record<string, number>;
    }

    const payload = await response.json();
    const prices: Record<string, number> = {};
    for (const mint of mints) {
      const price = Number(payload?.[mint]?.usdPrice ?? 0);
      if (Number.isFinite(price) && price > 0) {
        prices[mint] = price;
      }
    }

    return prices;
  } catch {
    return {} as Record<string, number>;
  }
}

export async function enqueueLiquidationIntentsForWallet(args: {
  wallet: LivePilotWalletConfig;
  connection: Connection;
  reason: string;
}) {
  const { wallet, connection, reason } = args;
  const [holdings, activeLiquidations, solPrice] = await Promise.all([
    getWalletTokenHoldings(connection, wallet.publicKey),
    listActiveLiquidationTrades(wallet.alias),
    getSolPrice(),
  ]);

  const activeMints = new Set(activeLiquidations.map((trade) => trade.token_in_mint).filter(Boolean));
  const prices = await fetchUsdPrices(holdings.map((holding) => holding.mint));

  const candidates = holdings.filter((holding) => {
    if (activeMints.has(holding.mint)) {
      return false;
    }

    const usdPrice = prices[holding.mint];
    if (!usdPrice) {
      return true;
    }

    const estimatedSolValue = (usdPrice * holding.uiAmount) / solPrice;
    return estimatedSolValue >= DUST_SOL_VALUE_THRESHOLD;
  });

  if (candidates.length === 0) {
    return {
      created: 0,
      skippedDust: holdings.length,
      pendingWork: activeLiquidations.length > 0,
      activeLiquidationCount: activeLiquidations.length,
      meaningfulHoldingCount: 0,
    };
  }

  const createdAt = new Date().toISOString();
  let created = 0;

  for (const holding of candidates) {
    const result = await createPilotTrade({
      wallet_alias: wallet.alias,
      wallet_public_key: wallet.publicKey,
      trigger_kind: 'liquidation',
      trigger_reason: reason,
      star_trader: null,
      star_trade_signature: null,
      leader_type: 'sell',
      token_in_mint: holding.mint,
      token_out_mint: WSOL,
      copy_ratio: 1,
      received_at: createdAt,
      intent_created_at: createdAt,
      sol_price_at_intent: solPrice,
      status: 'queued',
      skip_reason: null,
      error_message: null,
      next_retry_at: null,
    });

    if (result.created) {
      created += 1;
    }
  }

  if (created > 0) {
    await updatePilotRuntimeState(wallet.alias, {
      last_error: null,
    }).catch(() => undefined);

    await sendLivePilotAlert('Liquidation intents queued', [
      `wallet=${wallet.alias}`,
      `reason=${reason}`,
      `count=${created}`,
      `tokens=${candidates.map((holding) => getTokenSymbol(holding.mint)).join(', ')}`,
    ]).catch(() => undefined);
  }

  return {
    created,
    skippedDust: holdings.length - candidates.length,
    pendingWork: true,
    activeLiquidationCount: activeLiquidations.length,
    meaningfulHoldingCount: candidates.length,
  };
}
