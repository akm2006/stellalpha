/**
 * Trade Parser Regression Tests
 * 
 * Validates the refactored detectTrade logic against real and synthetic
 * Helius Enhanced webhook payloads.
 * 
 * Run: pnpm vitest run tests/trade-parser.test.ts
 */
import { describe, it, expect } from 'vitest';
import { detectTrade, WSOL } from '../lib/trade-parser';

// Fixture payloads
import caseA from './fixtures/case-a-memecoin-to-usd1-with-tip.json';
import caseB from './fixtures/case-b-usd1-to-wsol-sell.json';
import caseC from './fixtures/case-c-real-sol-to-token-swap.json';
import caseD from './fixtures/case-d-routed-token-swap-with-hop.json';

const USD1_MINT = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';
const BLACKROCK_MINT = '8Jgmaou5aAKyYgQer3C8VDaB2FtXXr5MQYtyaUXMbonk';
const SOL_PRICE = 84; // Approximate SOL price at time of incident

describe('Trade Parser - detectTrade', () => {

      // ============================================================
      // CASE A: Memecoin → USD1 + SOL tip (the bug that caused this)
      // ============================================================
      describe('Case A: Memecoin → USD1 swap with MEV tip (must NOT become SOL→USD1 buy)', () => {
            const wallet = '5TcyQLh8ojBf81DKeRC4vocTbNKJpJCsR9Kei16kLqDM';
            const trade = detectTrade(caseA, wallet, SOL_PRICE);

            it('should detect a trade', () => {
                  expect(trade).not.toBeNull();
            });

            it('should classify as sell (non-base sold for base)', () => {
                  expect(trade!.type).toBe('sell');
            });

            it('should identify BLACKROCK as the token being sold (tokenMint)', () => {
                  expect(trade!.tokenMint).toBe(BLACKROCK_MINT);
            });

            it('should NOT set tokenInMint to SOL', () => {
                  expect(trade!.tokenInMint).not.toBe('SOL');
            });

            it('should set tokenInMint to BLACKROCK', () => {
                  expect(trade!.tokenInMint).toBe(BLACKROCK_MINT);
            });

            it('should set tokenOutMint to USD1', () => {
                  expect(trade!.tokenOutMint).toBe(USD1_MINT);
            });

            it('should have correct tokenAmount (BLACKROCK amount sent)', () => {
                  expect(trade!.tokenAmount).toBeCloseTo(2283396.257967, 2);
            });

            it('should have correct tokenOutAmount (USD1 received by wallet)', () => {
                  // Only the amount received by the wallet, not fees to other addresses
                  expect(trade!.tokenOutAmount).toBeCloseTo(221.32116, 4);
            });

            it('should base USD value on USD1 (stablecoin), not SOL', () => {
                  // USD1 is a stablecoin, so baseAmount ≈ tokenOutAmount ≈ $221
                  expect(trade!.baseAmount).toBeCloseTo(221.32116, 2);
            });

            it('should have high confidence (clear token-to-token swap)', () => {
                  expect(trade!.confidence).toBe('high');
            });

            it('should NOT have baseAmount based on 0.011 SOL (the old bug)', () => {
                  // Old buggy value: solPrice * 0.011 ≈ $0.92
                  expect(trade!.baseAmount).toBeGreaterThan(100);
            });
      });

      // ============================================================
      // CASE B: USD1 → WSOL sell (base-to-base swap)
      // ============================================================
      describe('Case B: USD1 → WSOL sell (base-to-base swap)', () => {
            const wallet = '5TcyQLh8ojBf81DKeRC4vocTbNKJpJCsR9Kei16kLqDM';
            const trade = detectTrade(caseB, wallet, SOL_PRICE);

            it('should detect a trade', () => {
                  expect(trade).not.toBeNull();
            });

            it('should classify as buy (base-to-base → buy for DB compat)', () => {
                  // Base-to-base swaps use type='buy' for the output token
                  expect(trade!.type).toBe('buy');
            });

            it('should set tokenInMint to USD1', () => {
                  expect(trade!.tokenInMint).toBe(USD1_MINT);
            });

            it('should set tokenOutMint to WSOL', () => {
                  expect(trade!.tokenOutMint).toBe(WSOL);
            });

            it('should have tokenInAmount matching USD1 sent', () => {
                  expect(trade!.tokenInAmount).toBeCloseTo(223.147257, 4);
            });

            it('should have tokenOutAmount matching WSOL received', () => {
                  expect(trade!.tokenOutAmount).toBeCloseTo(2.65147734, 6);
            });

            it('should have baseAmount based on USD1 (stablecoin input)', () => {
                  // USD1 is a stablecoin, baseAmount ≈ 223.15
                  expect(trade!.baseAmount).toBeCloseTo(223.147257, 2);
            });

            it('should have medium confidence (base-to-base)', () => {
                  expect(trade!.confidence).toBe('medium');
            });
      });

      // ============================================================
      // CASE C: Real SOL → Token swap (SOL fallback should work)
      // ============================================================
      describe('Case C: Real SOL → memecoin buy (SOL fallback path)', () => {
            const wallet = 'WalletABC111111111111111111111111111111111';
            const trade = detectTrade(caseC, wallet, SOL_PRICE);

            it('should detect a trade', () => {
                  expect(trade).not.toBeNull();
            });

            it('should classify as buy', () => {
                  expect(trade!.type).toBe('buy');
            });

            it('should set tokenInMint to SOL (native SOL fallback)', () => {
                  expect(trade!.tokenInMint).toBe('SOL');
            });

            it('should set tokenOutMint to memecoin', () => {
                  expect(trade!.tokenOutMint).toBe('MEMEcoin111111111111111111111111111111111111');
            });

            it('should have tokenAmount = 100000 (memecoin received)', () => {
                  expect(trade!.tokenAmount).toBe(100000);
            });

            it('should calculate baseAmount from SOL spent', () => {
                  // solChangeNet = (-500005000 + 5000) / 1e9 = -0.5
                  // baseAmount = 84 * 0.5 = $42
                  expect(trade!.baseAmount).toBeCloseTo(SOL_PRICE * 0.5, 1);
            });

            it('should have medium confidence (SOL fallback)', () => {
                  expect(trade!.confidence).toBe('medium');
            });
      });

      // ============================================================
      // CASE D: Routed Token A → Token B with USD1 intermediate hop
      // ============================================================
      describe('Case D: Routed Token A → USD1 → Token B (router exclusion)', () => {
            const wallet = 'WalletXYZ111111111111111111111111111111111';
            const trade = detectTrade(caseD, wallet, SOL_PRICE);

            it('should detect a trade', () => {
                  expect(trade).not.toBeNull();
            });

            it('should identify Token A as the input (not USD1)', () => {
                  expect(trade!.tokenInMint).toBe('TokenAMint11111111111111111111111111111111');
            });

            it('should identify Token B as the output (not USD1)', () => {
                  expect(trade!.tokenOutMint).toBe('TokenBMint11111111111111111111111111111111');
            });

            it('should exclude USD1 as routing mint from final in/out', () => {
                  expect(trade!.tokenInMint).not.toBe(USD1_MINT);
                  expect(trade!.tokenOutMint).not.toBe(USD1_MINT);
            });

            it('should have tokenInAmount = 5000 (Token A sent)', () => {
                  expect(trade!.tokenInAmount).toBe(5000);
            });

            it('should have tokenOutAmount = 250 (Token B received)', () => {
                  expect(trade!.tokenOutAmount).toBe(250);
            });

            it('should classify as sell (both non-base)', () => {
                  // Both Token A and Token B are non-base, so type = 'sell' of inToken
                  expect(trade!.type).toBe('sell');
            });

            it('should have low confidence (both non-base, cannot determine USD value)', () => {
                  expect(trade!.confidence).toBe('low');
            });
      });

      // ============================================================
      // EDGE CASES
      // ============================================================
      describe('Edge Cases', () => {
            it('should return null when no token transfers or SOL changes', () => {
                  const emptyTx = {
                        signature: 'empty-sig',
                        fee: 5000,
                        timestamp: 123456,
                        tokenTransfers: [],
                        accountData: [{ account: 'wallet1', nativeBalanceChange: -5000 }],
                  };
                  const result = detectTrade(emptyTx, 'wallet1', SOL_PRICE);
                  expect(result).toBeNull();
            });

            it('should return null when only fee change (no meaningful SOL movement)', () => {
                  const feeTx = {
                        signature: 'fee-only-sig',
                        fee: 5000,
                        timestamp: 123456,
                        tokenTransfers: [
                              {
                                    fromUserAccount: 'wallet1',
                                    toUserAccount: 'other',
                                    tokenAmount: 100,
                                    mint: 'SomeToken111111111111111111111111111111111',
                              },
                        ],
                        nativeTransfers: [],
                        accountData: [{ account: 'wallet1', nativeBalanceChange: -5000 }],
                  };
                  // Only sent tokens but SOL didn't change meaningfully (just fee)
                  // solChangeNet = (-5000 + 5000) / 1e9 = 0 → not > 0.001
                  const result = detectTrade(feeTx, 'wallet1', SOL_PRICE);
                  expect(result).toBeNull();
            });
      });
});
