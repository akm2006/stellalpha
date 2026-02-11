/**
 * Trade Parser Module
 * 
 * Standalone, testable parser for Helius Enhanced webhook payloads.
 * Extracted from app/api/helius-webhook/route.ts for unit testability.
 * 
 * KEY FIX: Token-to-token analysis runs FIRST. SOL override is a FALLBACK
 * only when there are no bilateral token transfers. This prevents MEV tip
 * payments from hijacking the trade classification.
 */

// ============ CONSTANTS ============

export const WSOL = "So11111111111111111111111111111111111111112";

export const BASE_MINTS = new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
      'So11111111111111111111111111111111111111112',   // wSOL
]);

export const STABLECOIN_MINTS = new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
]);

/** Priority mints for input/output selection when multiple candidates exist.
 *  FIX: Now includes USD1 for consistency with BASE_MINTS. */
export const PRIORITY_MINTS = new Set([
      'So11111111111111111111111111111111111111112', // wSOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
]);

/** Safe stablecoin outputs that prevent SOL sell override.
 *  FIX: Now includes USD1 to prevent SOL sell override when USD1 is the real output. */
export const PRIORITY_SAFE_OUTPUTS = new Set([
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
]);

export const KNOWN_TOKENS: Record<string, string> = {
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
      'So11111111111111111111111111111111111111112': 'SOL',
      'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB': 'USD1',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'Bonk',
};

// ============ TYPES ============

export type TradeConfidence = 'high' | 'medium' | 'low';

export interface RawTrade {
      signature: string;
      wallet: string;
      type: 'buy' | 'sell';
      tokenMint: string;
      tokenAmount: number;
      baseAmount: number;
      tokenInMint: string;
      tokenInAmount: number;
      tokenInPreBalance: number;
      tokenOutMint: string;
      tokenOutAmount: number;
      timestamp: number;
      source: string;
      gas: number;
      confidence: TradeConfidence;
}

// ============ HELPERS ============

export function getTokenSymbol(mint: string): string {
      return KNOWN_TOKENS[mint] || mint.slice(0, 6);
}

export function getUsdValueSync(mint: string, amount: number, solPrice: number): number {
      if (STABLECOIN_MINTS.has(mint)) return amount;
      if (mint === 'SOL' || mint === WSOL) {
            return amount * solPrice;
      }
      return 0;
}

// ============ MAIN PARSER ============

/**
 * Detect and classify a trade from a Helius Enhanced webhook payload.
 * 
 * LOGIC ORDER (post-fix):
 * 1. Parse token transfers relevant to wallet
 * 2. If both sent & received tokens: Token-to-Token analysis
 *    a. Router exclusion (intersection logic)
 *    b. Priority selection (USDC/USDT/USD1/wSOL preferred)
 *    c. Buy/sell classification based on base asset membership
 *    d. confidence = 'high'
 * 3. FALLBACK: If only sent + SOL gained → Token→SOL sell (confidence = 'medium')
 * 4. FALLBACK: If only received + SOL lost → SOL→Token buy (confidence = 'medium')
 * 
 * @param tx - Helius Enhanced webhook transaction object
 * @param wallet - Star trader wallet address
 * @param solPrice - Current SOL price in USD (passed in to avoid async dependency)
 */
export function detectTrade(tx: any, wallet: string, solPrice: number): RawTrade | null {
      const t = tx.tokenTransfers || [];
      const fp = wallet;

      const walletAccountData = tx.accountData?.find((a: any) => a.account === fp);
      const solChange = walletAccountData?.nativeBalanceChange || 0;
      const fee = tx.fee || 0;
      const solChangeNet = (solChange + fee) / 1e9;

      const relevant = t.filter((x: any) => x.fromUserAccount === fp || x.toUserAccount === fp);
      const tokensSent = relevant.filter((x: any) => x.fromUserAccount === fp);
      const tokensReceived = relevant.filter((x: any) => x.toUserAccount === fp);

      let type: 'buy' | 'sell' = 'buy';
      let tokenMint = '';
      let tokenAmount = 0;
      let baseAmount = 0;
      let tokenInMint = '';
      let tokenInAmount = 0;
      let tokenOutMint = '';
      let tokenOutAmount = 0;
      let confidence: TradeConfidence = 'high';

      // ============ PATH 1: Token → Token swap (PREFERRED - runs first) ============
      if (tokensSent.length > 0 && tokensReceived.length > 0) {

            // 1. ROUTER TOKEN EXCLUSION (Intersection Logic)
            // Identify tokens that act as intermediate hops (appear in BOTH Sent and Received)
            // e.g. Swap Token A → USD1 → Token B usually shows:
            // Sent: [Token A, USD1]
            // Received: [USD1, Token B]
            // We must exclude USD1 to find the real source (Token A) and dest (Token B).
            const sentMints = new Set(tokensSent.map((t: any) => t.mint));
            const receivedMints = new Set(tokensReceived.map((t: any) => t.mint));
            const routingMints = new Set([...sentMints].filter(x => receivedMints.has(x)));

            // Filter candidates (unless they are the ONLY candidate)
            const validSent = tokensSent.filter((t: any) => !routingMints.has(t.mint));
            const validReceived = tokensReceived.filter((t: any) => !routingMints.has(t.mint));

            const candidatesSent = validSent.length > 0 ? validSent : tokensSent;
            const candidatesReceived = validReceived.length > 0 ? validReceived : tokensReceived;

            // 2. Base Asset Priority Logic (Input & Output)
            // INPUT SELECTION
            let inToken = candidatesSent.find((t: any) => PRIORITY_MINTS.has(t.mint));
            if (!inToken) {
                  inToken = candidatesSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
            }

            // OUTPUT SELECTION
            let outToken = candidatesReceived.find((t: any) => PRIORITY_MINTS.has(t.mint));
            if (!outToken) {
                  outToken = candidatesReceived.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
            }
            if (inToken.mint === outToken.mint) return null;

            tokenInMint = inToken.mint;
            tokenInAmount = inToken.tokenAmount;
            tokenOutMint = outToken.mint;
            tokenOutAmount = outToken.tokenAmount;

            const inIsBase = BASE_MINTS.has(inToken.mint);
            const outIsBase = BASE_MINTS.has(outToken.mint);

            // 3. Buy/Sell classification
            if (inIsBase && outIsBase) {
                  // Base-to-base swaps (USDC→SOL, SOL→USDC, USD1→SOL, etc)
                  type = 'buy';
                  tokenMint = outToken.mint;
                  tokenAmount = outToken.tokenAmount;
                  baseAmount = getUsdValueSync(inToken.mint, inToken.tokenAmount, solPrice);
                  confidence = 'medium'; // Base-to-base swaps are less useful for PnL
            } else if (inIsBase && !outIsBase) {
                  type = 'buy';
                  tokenMint = outToken.mint;
                  tokenAmount = outToken.tokenAmount;
                  baseAmount = getUsdValueSync(inToken.mint, inToken.tokenAmount, solPrice);
            } else if (!inIsBase && outIsBase) {
                  type = 'sell';
                  tokenMint = inToken.mint;
                  tokenAmount = inToken.tokenAmount;
                  baseAmount = getUsdValueSync(outToken.mint, outToken.tokenAmount, solPrice);
            } else {
                  // Both non-base: treat as sell of inToken (can't determine USD value)
                  type = 'sell';
                  tokenMint = inToken.mint;
                  tokenAmount = inToken.tokenAmount;
                  baseAmount = 0;
                  confidence = 'low'; // Cannot determine value without a base asset
            }
      }
      // ============ PATH 2: Token → SOL FALLBACK (only tokens sent, SOL received) ============
      else if (tokensSent.length > 0 && solChangeNet > 0.001) {
            const largest = tokensSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
            type = 'sell';
            tokenMint = largest.mint;
            tokenAmount = largest.tokenAmount;
            baseAmount = solPrice * solChangeNet;
            tokenInMint = largest.mint;
            tokenInAmount = largest.tokenAmount;
            tokenOutMint = 'SOL';
            tokenOutAmount = solChangeNet;
            confidence = 'medium'; // SOL fallback - less certain than token transfer evidence
      }
      // ============ PATH 3: SOL → Token FALLBACK (only tokens received, SOL spent) ============
      else if (tokensReceived.length > 0 && solChangeNet < -0.001) {
            const largest = tokensReceived.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
            type = 'buy';
            tokenMint = largest.mint;
            tokenAmount = largest.tokenAmount;
            baseAmount = solPrice * Math.abs(solChangeNet);
            tokenInMint = 'SOL';
            tokenInAmount = Math.abs(solChangeNet);
            tokenOutMint = largest.mint;
            tokenOutAmount = largest.tokenAmount;
            confidence = 'medium'; // SOL fallback
      }
      else {
            return null;
      }

      if (tokenAmount < 0.000001) {
            return null;
      }

      const result: RawTrade = {
            signature: tx.signature,
            wallet: fp,
            type,
            tokenMint,
            tokenAmount,
            baseAmount,
            tokenInMint,
            tokenInAmount,
            tokenInPreBalance: tokensSent.length > 0
                  ? Number(tokensSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b).preTokenBalance || 0)
                  : 0,
            tokenOutMint,
            tokenOutAmount,
            timestamp: tx.timestamp,
            source: tx.source || 'UNKNOWN',
            gas: fee / 1e9,
            confidence,
      };

      return result;
}
