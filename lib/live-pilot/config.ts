import { PublicKey } from '@solana/web3.js';
import type { LivePilotConfigSummary, PilotWalletConfigSummary } from '@/lib/live-pilot/types';

interface PilotWalletConfigInternal extends PilotWalletConfigSummary {
  secret: string | null;
}

export interface LivePilotPublicConfig extends LivePilotConfigSummary {
  wallets: PilotWalletConfigSummary[];
}

export interface LivePilotConfig extends LivePilotConfigSummary {
  wallets: PilotWalletConfigInternal[];
}

export type LivePilotWalletConfig = LivePilotConfig['wallets'][number];

function parseCsv(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseNumber(name: string, fallback: number, errors: string[]) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  errors.push(`${name} must be a valid number`);
  return fallback;
}

function parseInteger(name: string, fallback: number, errors: string[]) {
  const value = parseNumber(name, fallback, errors);
  return Number.isInteger(value) ? value : Math.round(value);
}

function isValidPublicKey(value: string) {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function parseWalletBase(slot: 'A' | 'B', errors: string[]) {
  const alias = process.env[`PILOT_WALLET_${slot}_ALIAS`]?.trim() || `wallet-${slot.toLowerCase()}`;
  const publicKey = process.env[`PILOT_WALLET_${slot}_PUBLIC_KEY`]?.trim() || '';
  const starTrader = process.env[`PILOT_WALLET_${slot}_STAR_TRADER`]?.trim() || '';

  const anyConfigured = Boolean(publicKey || starTrader || process.env[`PILOT_WALLET_${slot}_ALIAS`]);
  if (!anyConfigured) {
    return null;
  }

  const missingFields: string[] = [];
  if (!publicKey) missingFields.push('publicKey');
  if (!starTrader) missingFields.push('starTrader');

  if (publicKey && !isValidPublicKey(publicKey)) {
    errors.push(`PILOT_WALLET_${slot}_PUBLIC_KEY is not a valid Solana address`);
  }

  if (starTrader && !isValidPublicKey(starTrader)) {
    errors.push(`PILOT_WALLET_${slot}_STAR_TRADER is not a valid Solana address`);
  }

  return {
    slot,
    alias,
    publicKey,
    starTrader,
    missingFields,
  };
}

function parseWalletConfig(slot: 'A' | 'B', errors: string[]): PilotWalletConfigInternal | null {
  const base = parseWalletBase(slot, errors);
  if (!base) {
    return null;
  }

  const secret = process.env[`PILOT_WALLET_${slot}_SECRET`]?.trim() || null;

  return {
    slot: base.slot,
    alias: base.alias,
    publicKey: base.publicKey,
    starTrader: base.starTrader,
    cashMode: 'sol',
    mode: 'copy',
    isEnabled: parseBoolean(process.env[`PILOT_WALLET_${slot}_ENABLED`], true),
    hasSecret: Boolean(secret),
    secret,
    feeReservePct: parseNumber('PILOT_FEE_RESERVE_PCT', 0.1, errors),
    minFeeReserveSol: parseNumber('PILOT_MIN_FEE_RESERVE_SOL', 0.05, errors),
    minTradeSizeSol: parseNumber('PILOT_MIN_TRADE_SIZE_SOL', 0.02, errors),
    maxTradeBuypowerPct: parseNumber('PILOT_MAX_TRADE_BUYPOWER_PCT', 0.1, errors),
    buyMaxPriceImpactPct: parseNumber('PILOT_BUY_MAX_PRICE_IMPACT_PCT', 0.12, errors),
    buyMaxRequotes: parseInteger('PILOT_BUY_MAX_REQUOTES', 1, errors),
    sellSlippageRetryBps: parseInteger('PILOT_SELL_SLIPPAGE_RETRY_BPS', 200, errors),
    isComplete: base.missingFields.length === 0,
    missingFields: base.missingFields,
  };
}

function parsePublicWalletConfig(slot: 'A' | 'B', errors: string[]): PilotWalletConfigSummary | null {
  const base = parseWalletBase(slot, errors);
  if (!base) {
    return null;
  }

  return {
    slot: base.slot,
    alias: base.alias,
    publicKey: base.publicKey,
    starTrader: base.starTrader,
    cashMode: 'sol',
    mode: 'copy',
    isEnabled: parseBoolean(process.env[`PILOT_WALLET_${slot}_ENABLED`], true),
    hasSecret: false,
    feeReservePct: parseNumber('PILOT_FEE_RESERVE_PCT', 0.1, errors),
    minFeeReserveSol: parseNumber('PILOT_MIN_FEE_RESERVE_SOL', 0.05, errors),
    minTradeSizeSol: parseNumber('PILOT_MIN_TRADE_SIZE_SOL', 0.02, errors),
    maxTradeBuypowerPct: parseNumber('PILOT_MAX_TRADE_BUYPOWER_PCT', 0.1, errors),
    buyMaxPriceImpactPct: parseNumber('PILOT_BUY_MAX_PRICE_IMPACT_PCT', 0.12, errors),
    buyMaxRequotes: parseInteger('PILOT_BUY_MAX_REQUOTES', 1, errors),
    sellSlippageRetryBps: parseInteger('PILOT_SELL_SLIPPAGE_RETRY_BPS', 200, errors),
    isComplete: base.missingFields.length === 0,
    missingFields: base.missingFields,
  };
}

function parseLivePilotConfig() {
  const errors: string[] = [];
  const operatorWallets = parseCsv(process.env.PILOT_OPERATOR_WALLETS);

  for (const wallet of operatorWallets) {
    if (!isValidPublicKey(wallet)) {
      errors.push(`PILOT_OPERATOR_WALLETS contains an invalid Solana address: ${wallet}`);
    }
  }

  const wallets = (['A', 'B'] as const)
    .map((slot) => parseWalletConfig(slot, errors))
    .filter((wallet): wallet is PilotWalletConfigInternal => Boolean(wallet));

  if (wallets.length === 0) {
    errors.push('No pilot wallets configured. Set PILOT_WALLET_A_* / PILOT_WALLET_B_* env vars before enabling the operator surface.');
  }

  const duplicateAliases = new Set<string>();
  const aliasSet = new Set<string>();
  for (const wallet of wallets) {
    if (aliasSet.has(wallet.alias)) {
      duplicateAliases.add(wallet.alias);
    }
    aliasSet.add(wallet.alias);
  }

  for (const alias of duplicateAliases) {
    errors.push(`Duplicate pilot wallet alias detected: ${alias}`);
  }

  return {
    operatorWallets,
    wallets,
    errors,
  };
}

export function getLivePilotConfig(): LivePilotConfig {
  return parseLivePilotConfig();
}

export function getLivePilotPublicConfig(): LivePilotPublicConfig {
  const errors: string[] = [];
  const operatorWallets = parseCsv(process.env.PILOT_OPERATOR_WALLETS);

  for (const wallet of operatorWallets) {
    if (!isValidPublicKey(wallet)) {
      errors.push(`PILOT_OPERATOR_WALLETS contains an invalid Solana address: ${wallet}`);
    }
  }

  const wallets = (['A', 'B'] as const)
    .map((slot) => parsePublicWalletConfig(slot, errors))
    .filter((wallet): wallet is PilotWalletConfigSummary => Boolean(wallet));

  if (wallets.length === 0) {
    errors.push('No pilot wallets configured. Set PILOT_WALLET_A_* / PILOT_WALLET_B_* env vars before enabling the operator surface.');
  }

  const duplicateAliases = new Set<string>();
  const aliasSet = new Set<string>();
  for (const wallet of wallets) {
    if (aliasSet.has(wallet.alias)) {
      duplicateAliases.add(wallet.alias);
    }
    aliasSet.add(wallet.alias);
  }

  for (const alias of duplicateAliases) {
    errors.push(`Duplicate pilot wallet alias detected: ${alias}`);
  }

  return {
    operatorWallets,
    errors,
    wallets,
  };
}

export function toLivePilotConfigSummary(config: LivePilotPublicConfig | LivePilotConfig): LivePilotConfigSummary {
  return {
    operatorWallets: config.operatorWallets,
    errors: config.errors,
    wallets: config.wallets.map((wallet) => {
      if ('secret' in wallet) {
        const { secret: _secret, ...publicWallet } = wallet;
        return publicWallet;
      }

      return wallet;
    }),
  };
}

interface WalletLookupShape {
  alias: string;
  starTrader: string;
}

export function findPilotWalletForStarTrader<T extends WalletLookupShape>(
  config: { wallets: T[] },
  starTrader: string,
) {
  return config.wallets.find((wallet) => wallet.starTrader === starTrader);
}

export function findPilotWalletByAlias<T extends Pick<WalletLookupShape, 'alias'>>(
  config: { wallets: T[] },
  alias: string,
) {
  return config.wallets.find((wallet) => wallet.alias === alias);
}
