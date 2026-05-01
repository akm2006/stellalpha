import { Connection } from '@solana/web3.js';
import { getWalletTokenHoldings } from './liquidation';
import {
  reconcileCopiedPositionAmount,
  listAllOpenPilotStatesForWallet,
} from '@/lib/repositories/copy-position-states.repo';
import type { PilotWalletConfigSummary } from './types';
import { getTokenSymbol } from '../services/token-service';

export async function reconcileAllWalletPositions(wallet: PilotWalletConfigSummary, connection: Connection) {
  const holdings = await getWalletTokenHoldings(connection, wallet.publicKey);
  const holdingMap = new Map(holdings.map(h => [h.mint, h.uiAmount]));
  
  const copyStates = await listAllOpenPilotStatesForWallet({
    scopeKey: wallet.alias,
    starTrader: wallet.starTrader || '',
  });
  
  const allMints = new Set([...holdingMap.keys(), ...copyStates.map(s => s.mint)]);
  
  let reconciled = 0;
  for (const mint of allMints) {
    const actualOnChainAmount = holdingMap.get(mint) || 0;
    const existing = copyStates.find(s => s.mint === mint);
    
    const dbAmount = Number(existing?.copied_open_amount || 0);
    const drift = Math.abs(dbAmount - actualOnChainAmount);
    
    // Only reconcile if there is meaningful drift (> 0.1% or absolute > 1e-9)
    if (drift > Math.max(1e-9, dbAmount * 0.001)) {
      console.log(`[RECONCILE] ${wallet.alias}: Reconciling ${getTokenSymbol(mint)} ${dbAmount} -> ${actualOnChainAmount}`);
      await reconcileCopiedPositionAmount({
        scopeType: 'pilot',
        scopeKey: wallet.alias,
        starTrader: wallet.starTrader || existing?.star_trader || '',
        mint,
        tokenSymbol: getTokenSymbol(mint),
        tradeSignature: null,
        tradeTimestampIso: null,
        copiedOpenAmount: actualOnChainAmount,
      });
      reconciled++;
    }
  }
  
  return reconciled;
}
