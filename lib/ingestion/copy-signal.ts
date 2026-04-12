import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { RawTrade } from '@/lib/trade-parser';
import {
  getSolPrice,
  getTokenDecimals,
  getUsdValue,
} from '@/lib/services/token-service';

export const BUY_STALENESS_THRESHOLD_MS = 10_000;

const SAFE_BOOST_TIERS = [
  { maxRatio: 0.0025, multiplier: 15, name: 'Micro Dust' },
  { maxRatio: 0.0050, multiplier: 10, name: 'Deep Value' },
  { maxRatio: 0.0100, multiplier: 5, name: 'Small Bet' },
  { maxRatio: 0.0300, multiplier: 2, name: 'Standard' },
  { maxRatio: 1.0, multiplier: 1, name: 'High Conviction' },
];

export interface CopyTradeSignal {
  rawRatio: number;
  finalRatio: number;
  leaderMetric: number;
  leaderUsdValue: number;
  boostTier: string;
  boostMultiplier: number;
  tradeAgeMs: number;
  isStaleBuy: boolean;
  solPrice: number;
}

export function applySafeBoost(rawRatio: number): { boostedRatio: number; tier: string; multiplier: number } {
  for (const tier of SAFE_BOOST_TIERS) {
    if (rawRatio <= tier.maxRatio) {
      return {
        boostedRatio: rawRatio * tier.multiplier,
        tier: tier.name,
        multiplier: tier.multiplier,
      };
    }
  }

  return { boostedRatio: rawRatio, tier: 'High Conviction', multiplier: 1 };
}

export function createPrivateRpcConnection() {
  const rpcUrl = process.env.HELIUS_API_RPC_URL;
  if (!rpcUrl || !rpcUrl.startsWith('http')) {
    return null;
  }

  try {
    return new Connection(rpcUrl);
  } catch (error) {
    console.warn('[COPY_SIGNAL] Failed to create private RPC connection:', error);
    return null;
  }
}

export async function getTraderBuyingPower(walletAddress: string, connection: Connection, solPrice: number): Promise<number> {
  try {
    const wallet = new PublicKey(walletAddress);
    const usdcAta = getAssociatedTokenAddressSync(new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), wallet);
    const usdtAta = getAssociatedTokenAddressSync(new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), wallet);
    const usd1Ata = getAssociatedTokenAddressSync(new PublicKey('USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'), wallet);
    const wsolAta = getAssociatedTokenAddressSync(new PublicKey('So11111111111111111111111111111111111111112'), wallet);

    const accounts = await connection.getMultipleAccountsInfo([wallet, usdcAta, usdtAta, usd1Ata, wsolAta]);
    let totalUsdValue = 0;

    const parseAmount = (data: Buffer) => {
      if (data.length < 72) return BigInt(0);
      return data.readBigUInt64LE(64);
    };

    if (accounts[0]) {
      totalUsdValue += (accounts[0].lamports / 1e9) * solPrice;
    }
    if (accounts[1]) {
      totalUsdValue += Number(parseAmount(accounts[1].data)) / 1e6;
    }
    if (accounts[2]) {
      totalUsdValue += Number(parseAmount(accounts[2].data)) / 1e6;
    }
    if (accounts[3]) {
      totalUsdValue += Number(parseAmount(accounts[3].data)) / 1e6;
    }
    if (accounts[4]) {
      totalUsdValue += (Number(parseAmount(accounts[4].data)) / 1e9) * solPrice;
    }

    return totalUsdValue;
  } catch (error) {
    console.error(`[COPY_SIGNAL] Failed to fetch buying power for ${walletAddress}:`, error);
    return 0;
  }
}

export async function computeCopyTradeSignal(
  trade: RawTrade,
  receivedAt: number,
  connection: Connection | null = createPrivateRpcConnection(),
): Promise<CopyTradeSignal> {
  const starTrader = trade.wallet;
  const sourceMint = trade.tokenInMint;
  const destMint = trade.tokenOutMint;
  const solPrice = await getSolPrice();

  let ratio = 0;
  let leaderMetric = 0;
  let leaderUsdValue = 0;

  try {
    if (trade.type === 'buy') {
      if (connection) {
        const postTradeBuyingPower = await getTraderBuyingPower(starTrader, connection, solPrice);
        leaderUsdValue = await getUsdValue(sourceMint, trade.tokenInAmount);
        const preTradeBuyingPower = postTradeBuyingPower + leaderUsdValue;

        leaderMetric = preTradeBuyingPower;
        ratio = preTradeBuyingPower > 0 ? leaderUsdValue / preTradeBuyingPower : 0;
      } else {
        console.warn('[COPY_SIGNAL] Skipping buy-side ratio reconstruction because HELIUS_API_RPC_URL is unavailable.');
      }
    } else {
      leaderUsdValue = await getUsdValue(destMint, trade.tokenOutAmount);

      if (connection) {
        const mintPubkey = new PublicKey(sourceMint);
        const ata = getAssociatedTokenAddressSync(mintPubkey, new PublicKey(starTrader));
        const accountInfo = await connection.getAccountInfo(ata);
        let postTradeTokenBalance = 0;

        if (accountInfo && accountInfo.data.length >= 72) {
          const rawAmount = Number(accountInfo.data.readBigUInt64LE(64));
          const decimals = await getTokenDecimals(sourceMint);
          postTradeTokenBalance = rawAmount / Math.pow(10, decimals);
        }

        const preTradeTokenBalance = postTradeTokenBalance + trade.tokenInAmount;
        leaderMetric = preTradeTokenBalance;
        ratio = preTradeTokenBalance > 0 ? trade.tokenInAmount / preTradeTokenBalance : 0;
      } else {
        console.warn('[COPY_SIGNAL] Skipping sell-side ratio reconstruction because HELIUS_API_RPC_URL is unavailable.');
      }
    }
  } catch (error: any) {
    console.warn('[COPY_SIGNAL] Ratio reconstruction failed:', error?.message || error);
    ratio = 0;
  }

  ratio = Math.min(Math.max(ratio, 0), 1);
  if (Number.isNaN(ratio)) {
    ratio = 0;
  }

  let finalRatio = ratio;
  let boostTier = 'None';
  let boostMultiplier = 1;

  if (trade.type === 'buy' && ratio > 0) {
    const boost = applySafeBoost(ratio);
    finalRatio = boost.boostedRatio;
    boostTier = boost.tier;
    boostMultiplier = boost.multiplier;
  }

  const tradeAgeMs = receivedAt - trade.timestamp * 1000;
  const isStaleBuy = trade.type === 'buy' && tradeAgeMs > BUY_STALENESS_THRESHOLD_MS;

  return {
    rawRatio: ratio,
    finalRatio,
    leaderMetric,
    leaderUsdValue,
    boostTier,
    boostMultiplier,
    tradeAgeMs,
    isStaleBuy,
    solPrice,
  };
}
