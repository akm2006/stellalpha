// ============ EXTRACT ALL INVOLVED ADDRESSES FROM HELIUS PAYLOAD ============
// Used to detect trades even when Star Trader uses a relayer/bot as feePayer
// Performance: Uses Set for O(1) deduplication, then single DB query with .in()
export function extractInvolvedAddresses(tx: any): Set<string> {
  const addresses = new Set<string>();

  // 1. Always include feePayer (may be the trader or a relayer)
  if (tx.feePayer) {
    addresses.add(tx.feePayer);
  }

  // 2. Extract from tokenTransfers (PRIMARY - most reliable for swaps)
  // This is where the actual trader appears even when using bots
  for (const transfer of tx.tokenTransfers || []) {
    if (transfer.fromUserAccount) addresses.add(transfer.fromUserAccount);
    if (transfer.toUserAccount) addresses.add(transfer.toUserAccount);
  }

  // 3. Extract from nativeTransfers (SOL movements)
  for (const transfer of tx.nativeTransfers || []) {
    if (transfer.fromUserAccount) addresses.add(transfer.fromUserAccount);
    if (transfer.toUserAccount) addresses.add(transfer.toUserAccount);
  }

  // 4. Extract from accountData (all touched accounts)
  // Note: This can include many program accounts, but our star_traders
  // table will filter to only real wallets
  for (const acc of tx.accountData || []) {
    if (acc.account) addresses.add(acc.account);
  }

  // 5. Remove known system program addresses to reduce false positives
  addresses.delete('11111111111111111111111111111111'); // System Program
  addresses.delete('ComputeBudget111111111111111111111111111111'); // Compute Budget
  addresses.delete('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'); // Token Program
  addresses.delete('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'); // Associated Token
  addresses.delete('SysvarRent111111111111111111111111111111111'); // Rent Sysvar

  return addresses;
}
