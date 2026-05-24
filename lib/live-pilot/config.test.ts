import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardedHybridCopyModelConfig } from '@/lib/copy-models/types';
import { getLivePilotConfig, getLivePilotPublicConfig } from '@/lib/live-pilot/config';

const PILOT_ENV_KEYS = [
  'PILOT_OPERATOR_WALLETS',
  'PILOT_WALLET_A_ALIAS',
  'PILOT_WALLET_A_PUBLIC_KEY',
  'PILOT_WALLET_A_SECRET',
  'PILOT_WALLET_A_STAR_TRADER',
  'PILOT_WALLET_A_PROFILE',
  'PILOT_WALLET_B_ALIAS',
  'PILOT_WALLET_B_PUBLIC_KEY',
  'PILOT_WALLET_B_SECRET',
  'PILOT_WALLET_B_STAR_TRADER',
  'PILOT_WALLET_B_PROFILE',
  'PILOT_WALLET_B_BUY_MODEL_KEY',
  'PILOT_WALLET_B_BUY_MODEL_PCT',
  'PILOT_WALLET_B_BASE_BUY_PCT',
  'PILOT_WALLET_B_MAX_BUY_PCT',
  'PILOT_WALLET_B_MAX_MINT_EXPOSURE_PCT',
  'PILOT_WALLET_B_MAX_DCA_BUYS_PER_MINT',
  'PILOT_WALLET_B_NEW_POSITION_MAX_AGE_MS',
  'PILOT_FEE_RESERVE_PCT',
  'PILOT_MIN_FEE_RESERVE_SOL',
  'PILOT_MIN_TRADE_SIZE_SOL',
] as const;

function resetPilotEnv() {
  for (const key of PILOT_ENV_KEYS) {
    vi.stubEnv(key, '');
  }
}

function configurePilotBEnv() {
  vi.stubEnv('PILOT_WALLET_B_ALIAS', 'PilotB_CR');
  vi.stubEnv('PILOT_WALLET_B_PUBLIC_KEY', '11111111111111111111111111111111');
  vi.stubEnv('PILOT_WALLET_B_SECRET', 'local-test-secret');
  vi.stubEnv('PILOT_WALLET_B_STAR_TRADER', '515vh1DrPuwMATt9Zoq9kP4sJL9fyojA1dHJu4DQpNRp');
  vi.stubEnv('PILOT_MIN_TRADE_SIZE_SOL', '0.005');
}

describe('live-pilot config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetPilotEnv();
  });

  it('applies the micro longevity profile as a single env override', () => {
    configurePilotBEnv();
    vi.stubEnv('PILOT_WALLET_B_PROFILE', 'micro_longevity_7d');
    vi.stubEnv('PILOT_WALLET_B_BUY_MODEL_KEY', 'fixed_available_pct');
    vi.stubEnv('PILOT_WALLET_B_BUY_MODEL_PCT', '99');
    vi.stubEnv('PILOT_FEE_RESERVE_PCT', '0.10');
    vi.stubEnv('PILOT_MIN_FEE_RESERVE_SOL', '0.05');

    const config = getLivePilotConfig();
    const wallet = config.wallets.find((entry) => entry.alias === 'PilotB_CR');
    expect(wallet).toBeDefined();
    expect(config.errors).toEqual([]);
    expect(wallet?.profileKey).toBe('micro_longevity_7d');
    expect(wallet?.buyModelKey).toBe('guarded_hybrid');
    expect(wallet?.feeReservePct).toBe(0.08);
    expect(wallet?.minFeeReserveSol).toBe(0.02);

    const modelConfig = wallet?.buyModelConfig as GuardedHybridCopyModelConfig;
    expect(modelConfig).toMatchObject({
      baseBuyPct: 0.35,
      maxBuyPct: 0.75,
      maxMintExposurePct: 2.5,
      maxDcaBuysPerMint: 1,
      dcaSecondBuyPct: 0.1,
      dcaThirdBuyPct: 0.1,
      newPositionMaxAgeMs: 2500,
    });
  });

  it('marks an unknown wallet profile incomplete instead of silently trading', () => {
    configurePilotBEnv();
    vi.stubEnv('PILOT_WALLET_B_PROFILE', 'unknown_profile');
    vi.stubEnv('PILOT_WALLET_B_BUY_MODEL_KEY', 'guarded_hybrid');

    const config = getLivePilotPublicConfig();
    const wallet = config.wallets.find((entry) => entry.alias === 'PilotB_CR');
    expect(wallet?.isComplete).toBe(false);
    expect(wallet?.missingFields).toContain('profile');
    expect(config.errors).toContain('PILOT_WALLET_B_PROFILE must be one of: micro_longevity_7d');
  });
});
