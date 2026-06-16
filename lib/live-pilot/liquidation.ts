import { PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import type { Connection } from '@solana/web3.js';
import type { LivePilotWalletConfig } from '@/lib/live-pilot/config';
import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { listActivePilotMintQuarantines } from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  listActiveLiquidationTrades,
  createPilotTrade,
  updatePilotTrade,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';
import { updatePilotRuntimeState } from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import {
  getCopyPositionState,
  listAllOpenPilotStatesForWallet,
} from '@/lib/repositories/copy-position-states.repo';
import { jupiterFetch } from '@/lib/jupiter/client';
import { getSolPrice, getTokenSymbol } from '@/lib/services/token-service';

const DUST_SOL_VALUE_THRESHOLD = 0.001;
const WSOL = 'So11111111111111111111111111111111111111112';

interface TokenHolding {
  mint: string;
  rawAmount: string;
  uiAmount: number;
  decimals: number;
}

interface LiquidationCandidate extends TokenHolding {
  estimatedSolValue: number | null;
}

interface WalletLiquidationStatusArgs {
  walletAlias: string;
  walletPublicKey: string;
  starTrader?: string | null;
  connection: Connection;
}

function rawToUi(rawAmount: bigint, decimals: number) {
  return Number(rawAmount) / Math.pow(10, decimals);
}

export async function getWalletTokenHoldings(connection: Connection, walletPublicKey: string) {
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

  try {
    const response = await jupiterFetch(`https://api.jup.ag/price/v3?ids=${mints.join(',')}`, {}, {
      scope: 'price',
      operation: 'liquidation-price',
    });
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

function selectMeaningfulLiquidationCandidates(args: {
  holdings: TokenHolding[];
  prices: Record<string, number>;
  solPrice: number;
  copiedMintSet: Set<string>;
}) {
  const { holdings, prices, solPrice, copiedMintSet } = args;

  return holdings
    .map((holding) => {
      const usdPrice = prices[holding.mint];
      const estimatedSolValue = usdPrice
        ? (usdPrice * holding.uiAmount) / solPrice
        : null;

      return {
        ...holding,
        estimatedSolValue,
      } satisfies LiquidationCandidate;
    })
    .filter((holding) => {
      if (holding.estimatedSolValue === null) {
        return copiedMintSet.has(holding.mint);
      }

      return holding.estimatedSolValue >= DUST_SOL_VALUE_THRESHOLD;
    });
}

export async function getWalletLiquidationStatus(args: WalletLiquidationStatusArgs) {
  const { walletAlias, walletPublicKey, starTrader, connection } = args;
  const [holdings, activeLiquidations, solPrice, quarantines, copyStates] = await Promise.all([
    getWalletTokenHoldings(connection, walletPublicKey),
    listActiveLiquidationTrades(walletAlias),
    getSolPrice(),
    listActivePilotMintQuarantines(),
    starTrader
      ? listAllOpenPilotStatesForWallet({
          scopeKey: walletAlias,
          starTrader,
        }).catch(() => [])
      : Promise.resolve([]),
  ]);

  const prices = await fetchUsdPrices(holdings.map((holding) => holding.mint));
  const copiedMintSet = new Set(copyStates.map((state) => state.mint));
  const meaningfulHoldings = selectMeaningfulLiquidationCandidates({
    holdings,
    prices,
    solPrice,
    copiedMintSet,
  });
  const quarantinedMintSet = new Set(quarantines.map((entry) => entry.mint));
  const deadInventoryHoldings = meaningfulHoldings.filter((holding) => quarantinedMintSet.has(holding.mint));
  const liquidatableHoldings = meaningfulHoldings.filter((holding) => !quarantinedMintSet.has(holding.mint));
  const liquidatableMintSet = new Set(liquidatableHoldings.map((holding) => holding.mint));
  const actionableActiveLiquidations = activeLiquidations.filter((trade) =>
    Boolean(trade.token_in_mint && liquidatableMintSet.has(trade.token_in_mint)),
  );
  const obsoleteActiveLiquidations = activeLiquidations.filter((trade) =>
    !trade.token_in_mint || !liquidatableMintSet.has(trade.token_in_mint),
  );

  return {
    holdings,
    meaningfulHoldings,
    deadInventoryHoldings,
    liquidatableHoldings,
    activeLiquidations: actionableActiveLiquidations,
    obsoleteActiveLiquidations,
    activeLiquidationCount: actionableActiveLiquidations.length,
    obsoleteActiveLiquidationCount: obsoleteActiveLiquidations.length,
    meaningfulHoldingCount: meaningfulHoldings.length,
    deadInventoryCount: deadInventoryHoldings.length,
    isFlat: liquidatableHoldings.length === 0,
    pendingWork: actionableActiveLiquidations.length > 0 || liquidatableHoldings.length > 0,
    solPrice,
  };
}

export async function enqueueLiquidationIntentsForWallet(args: {
  wallet: LivePilotWalletConfig;
  connection: Connection;
  reason: string;
}) {
  const { wallet, connection, reason } = args;
  const {
    holdings,
    liquidatableHoldings,
    activeLiquidations,
    obsoleteActiveLiquidations,
    activeLiquidationCount,
    meaningfulHoldingCount,
    deadInventoryCount,
    pendingWork,
    solPrice,
  } = await getWalletLiquidationStatus({
    walletAlias: wallet.alias,
    walletPublicKey: wallet.publicKey,
    starTrader: wallet.starTrader,
    connection,
  });

  if (obsoleteActiveLiquidations.length > 0) {
    await Promise.all(
      obsoleteActiveLiquidations.map((trade) =>
        updatePilotTrade(trade.id, {
          status: 'skipped',
          skip_reason: 'liquidation_not_needed',
          error_message: trade.token_in_mint
            ? `${getTokenSymbol(trade.token_in_mint)} is no longer a meaningful liquidatable holding`
            : 'Liquidation trade is missing token_in_mint',
          next_retry_at: null,
        }).catch(() => undefined),
      ),
    );
  }

  const activeMints = new Set(activeLiquidations.map((trade) => trade.token_in_mint).filter(Boolean));
  const candidates = liquidatableHoldings.filter((holding) => !activeMints.has(holding.mint));

  if (candidates.length === 0) {
    return {
      created: 0,
      skippedDust: holdings.length,
      pendingWork,
      activeLiquidationCount,
      meaningfulHoldingCount,
      deadInventoryCount,
    };
  }

  const createdAt = new Date().toISOString();
  let created = 0;

  for (const holding of candidates) {
    const copyState = await getCopyPositionState({
      scopeType: 'pilot',
      scopeKey: wallet.alias,
      starTrader: wallet.starTrader,
      mint: holding.mint,
    });
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
      leader_position_before: null,
      leader_position_after: null,
      copied_position_before: copyState?.copied_open_amount ?? holding.uiAmount,
      copied_position_after: copyState?.copied_open_amount ?? holding.uiAmount,
      sell_fraction: null,
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
    ], {
      severity: 'action',
      dedupeKey: `liquidation-intents:${wallet.alias}:${reason}`,
      dedupeTtlMs: 10 * 60 * 1000,
    }).catch(() => undefined);
  }

    return {
      created,
      skippedDust: holdings.length - candidates.length,
      pendingWork: true,
      activeLiquidationCount,
      meaningfulHoldingCount,
      deadInventoryCount,
    };
}
