import { BASE_MINTS, STABLECOIN_MINTS, WSOL } from '@/lib/trade-parser';

export interface EngineTradeOutput {
  signature: string;
  wallet: string;
  feePayer: string;
  timestamp: number | null;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenAmount: number;
  baseAmount: number | null;
  tokenInMint: string;
  tokenInAmount: number;
  tokenOutMint: string;
  tokenOutAmount: number;
  gas: number | null;
}

export interface AdaptedTradeRecord {
  signature: string;
  wallet: string;
  parsed: EngineTradeOutput | null;
  meta: {
    path: 'swap_action' | 'net_transfers' | 'native_fallback' | 'unparsed';
    feePayer: string | null;
    nativeClusterDeltaSol: number | null;
    nativeTradeDeltaSol: number | null;
    tokenNetByMint: Record<string, number>;
    actionTypeCounts: Record<string, number>;
    notes: string[];
  };
}

const SOL_MINT = WSOL;
const SOL_LITERAL = 'SOL';
const NATIVE_EPSILON = 0.001;

interface TokenFlow {
  mint: string;
  amount: number;
  source?: 'token' | 'native';
}

interface FlowCandidate {
  inputMint: string;
  inputAmount: number;
  outputMint: string;
  outputAmount: number;
  source: 'swap_action' | 'swap_leg' | 'sell_action';
}

interface DirectWalletFlows {
  sent: TokenFlow[];
  received: TokenFlow[];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBaseMint(mint: string) {
  return BASE_MINTS.has(mint) || mint === SOL_LITERAL;
}

function isSolLikeMint(mint: string) {
  return mint === SOL_LITERAL || mint === SOL_MINT;
}

function deriveBaseAmount(mint: string, amount: number) {
  if (STABLECOIN_MINTS.has(mint)) {
    return amount;
  }
  if (isSolLikeMint(mint)) {
    return amount;
  }
  return null;
}

function getAccountKeys(parsed: any) {
  return Array.isArray(parsed?.raw?.transaction?.message?.accountKeys)
    ? parsed.raw.transaction.message.accountKeys
    : [];
}

function getAccountKeyPubkey(entry: any): string | null {
  if (typeof entry === 'string') {
    return entry;
  }

  if (typeof entry?.pubkey === 'string') {
    return entry.pubkey;
  }

  return null;
}

function getFeeLamports(parsed: any) {
  return toNumber(parsed?.raw?.meta?.fee) ?? toNumber(parsed?.fee) ?? null;
}

function getTimestamp(parsed: any) {
  const numeric = toNumber(parsed?.timestamp) ?? toNumber(parsed?.block_time);
  if (numeric !== null) {
    return numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
  }

  const iso = typeof parsed?.timestamp === 'string' ? Date.parse(parsed.timestamp) : NaN;
  if (Number.isFinite(iso)) {
    return Math.floor(iso / 1000);
  }

  const blockTimeIso = typeof parsed?.block_time === 'string' ? Date.parse(parsed.block_time) : NaN;
  if (Number.isFinite(blockTimeIso)) {
    return Math.floor(blockTimeIso / 1000);
  }

  return null;
}

function buildSwapFlowCandidate(
  inputMint: unknown,
  inputAmount: unknown,
  outputMint: unknown,
  outputAmount: unknown,
  source: FlowCandidate['source']
) {
  const inMint = typeof inputMint === 'string' ? inputMint : null;
  const outMint = typeof outputMint === 'string' ? outputMint : null;
  const inAmount = toNumber(inputAmount);
  const outAmount = toNumber(outputAmount);

  if (!inMint || !outMint || !inAmount || !outAmount || inAmount <= 0 || outAmount <= 0) {
    return null;
  }

  return {
    inputMint: inMint,
    inputAmount: inAmount,
    outputMint: outMint,
    outputAmount: outAmount,
    source,
  } satisfies FlowCandidate;
}

function chooseSwapCandidate(
  parsed: any,
  wallet: string,
  feePayer: string,
  tokenNet: Map<string, number>,
  nativeTradeDeltaSol: number,
  clusterTokenChangeByMint: Map<string, number>
) {
  const actions: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const walletLower = wallet.toLowerCase();
  const feePayerLower = feePayer.toLowerCase();
  const flowCandidates: Array<{ candidate: FlowCandidate; score: number }> = [];

  for (const action of actions) {
    const type = typeof action?.type === 'string' ? action.type : '';
    const swapper = typeof action?.info?.swapper === 'string' ? action.info.swapper.toLowerCase() : null;
    const actionCandidates: FlowCandidate[] = [];

    const topLevel = buildSwapFlowCandidate(
      action?.info?.tokens_swapped?.in?.token_address,
      action?.info?.tokens_swapped?.in?.amount,
      action?.info?.tokens_swapped?.out?.token_address,
      action?.info?.tokens_swapped?.out?.amount,
      'swap_action'
    );
    if (topLevel) {
      actionCandidates.push(topLevel);
    }

    const legs: any[] = Array.isArray(action?.info?.swaps) ? action.info.swaps : [];
    for (const leg of legs) {
      const legCandidate = buildSwapFlowCandidate(
        leg?.in?.token_address,
        leg?.in?.amount,
        leg?.out?.token_address,
        leg?.out?.amount,
        'swap_leg'
      );
      if (legCandidate) {
        actionCandidates.push(legCandidate);
      }
    }

    if (type === 'SELL') {
      const inputMint = typeof action?.info?.mint === 'string' ? action.info.mint : null;
      if (inputMint) {
        const clusterDelta = Math.abs(clusterTokenChangeByMint.get(inputMint) || 0);
        const inputAmount = clusterDelta > 0 ? clusterDelta : Math.abs(toNumber(action?.info?.amount) || 0);
        const outputAmount = Math.abs(nativeTradeDeltaSol);
        if (inputAmount > 0 && outputAmount > 0) {
          actionCandidates.push({
            inputMint,
            inputAmount,
            outputMint: SOL_LITERAL,
            outputAmount,
            source: 'sell_action',
          });
        }
      }
    }

    for (const candidate of actionCandidates) {
      const inputNet = tokenNet.get(candidate.inputMint) || 0;
      const outputNet = tokenNet.get(candidate.outputMint) || 0;
      const inputClusterDelta = clusterTokenChangeByMint.get(candidate.inputMint) || 0;
      const outputClusterDelta = clusterTokenChangeByMint.get(candidate.outputMint) || 0;
      const inputIsBase = isBaseMint(candidate.inputMint);
      const outputIsBase = isBaseMint(candidate.outputMint);
      const inputIsSol = isSolLikeMint(candidate.inputMint);
      const outputIsSol = isSolLikeMint(candidate.outputMint);
      const solNet =
        (tokenNet.get(SOL_MINT) || 0) +
        (tokenNet.get(SOL_LITERAL) || 0);
      const netCompatible =
        (inputNet < -1e-9 || inputClusterDelta < -1e-9 || (inputIsSol && nativeTradeDeltaSol < -NATIVE_EPSILON)) &&
        (outputNet > 1e-9 || outputClusterDelta > 1e-9 || (outputIsSol && nativeTradeDeltaSol > NATIVE_EPSILON));

      let score = 0;
      if (swapper === walletLower) score += 8;
      if (swapper === feePayerLower) score += 4;
      if (candidate.source === 'swap_leg') score += 8;
      if (candidate.source === 'sell_action') score += 10;
      if (inputIsBase !== outputIsBase) score += 18;
      if (inputIsBase && !outputIsBase) score += 10;
      if (!inputIsBase && outputIsBase) score += 10;
      if ((inputIsSol && !outputIsBase) || (!inputIsBase && outputIsSol)) score += 6;
      if (STABLECOIN_MINTS.has(candidate.inputMint) && !outputIsBase && solNet < -1e-9) score -= 18;
      if (STABLECOIN_MINTS.has(candidate.outputMint) && !inputIsBase && solNet > 1e-9) score -= 18;
      if (netCompatible) score += 18;
      if (!netCompatible && candidate.source !== 'sell_action') score -= 25;

      flowCandidates.push({ candidate, score });
    }
  }

  flowCandidates.sort((left, right) => right.score - left.score);
  if ((flowCandidates[0]?.score || 0) < 20) {
    return null;
  }

  return flowCandidates[0]?.candidate || null;
}

function aggregateClusterTokenNet(parsed: any, cluster: Set<string>) {
  const actions: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const net = new Map<string, number>();

  for (const action of actions) {
    if (action?.type !== 'TOKEN_TRANSFER') {
      continue;
    }

    const mint = typeof action?.info?.token_address === 'string' ? action.info.token_address : null;
    const amount = toNumber(action?.info?.amount);
    const sender = typeof action?.info?.sender === 'string' ? action.info.sender : null;
    const receiver = typeof action?.info?.receiver === 'string' ? action.info.receiver : null;

    if (!mint || !amount || amount <= 0 || !sender || !receiver) {
      continue;
    }

    const senderInCluster = cluster.has(sender.toLowerCase());
    const receiverInCluster = cluster.has(receiver.toLowerCase());

    if (senderInCluster === receiverInCluster) {
      continue;
    }

    const current = net.get(mint) || 0;
    if (receiverInCluster) {
      net.set(mint, current + amount);
    } else {
      net.set(mint, current - amount);
    }
  }

  return net;
}

function aggregateActionTypeCounts(parsed: any) {
  const actions: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const counts = new Map<string, number>();

  for (const action of actions) {
    const type = typeof action?.type === 'string' ? action.type : 'UNKNOWN';
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  return Object.fromEntries(counts);
}

function hasSwapLikeAction(parsed: any) {
  const actions: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
  return actions.some((action) => {
    const type = typeof action?.type === 'string' ? action.type : '';
    return type.includes('SWAP') || type === 'SELL' || type === 'BUY_EXACT_SOL_IN' || type === 'ROUTE_V2';
  });
}

function extractDirectWalletFlows(parsed: any, wallet: string): DirectWalletFlows {
  const actions: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const walletLower = wallet.toLowerCase();
  const sent: TokenFlow[] = [];
  const received: TokenFlow[] = [];

  for (const action of actions) {
    const type = typeof action?.type === 'string' ? action.type : '';
    const sender = typeof action?.info?.sender === 'string' ? action.info.sender.toLowerCase() : null;
    const receiver = typeof action?.info?.receiver === 'string' ? action.info.receiver.toLowerCase() : null;

    if (!sender || !receiver || sender === receiver) {
      continue;
    }

    const amount = toNumber(action?.info?.amount);
    if (!amount || amount <= 0) {
      continue;
    }

    let mint: string | null = null;
    if (type === 'TOKEN_TRANSFER') {
      mint = typeof action?.info?.token_address === 'string' ? action.info.token_address : null;
    } else if (type === 'SOL_TRANSFER') {
      mint = SOL_LITERAL;
    }

    if (!mint) {
      continue;
    }

    if (sender === walletLower && receiver !== walletLower) {
      sent.push({ mint, amount, source: mint === SOL_LITERAL ? 'native' : 'token' });
      continue;
    }

    if (receiver === walletLower && sender !== walletLower) {
      received.push({ mint, amount, source: mint === SOL_LITERAL ? 'native' : 'token' });
    }
  }

  return { sent, received };
}

function aggregateClusterTokenBalanceChanges(parsed: any, cluster: Set<string>) {
  const entries: any[] = Array.isArray(parsed?.token_balance_changes) ? parsed.token_balance_changes : [];
  const net = new Map<string, number>();

  for (const entry of entries) {
    const owner = typeof entry?.owner === 'string' ? entry.owner : null;
    const mint = typeof entry?.mint === 'string' ? entry.mint : null;
    const changeRaw = toNumber(entry?.change_amount);
    const decimals = toNumber(entry?.decimals) ?? 0;

    if (!owner || !mint || changeRaw === null || !cluster.has(owner.toLowerCase())) {
      continue;
    }

    const amount = changeRaw / 10 ** decimals;
    const current = net.get(mint) || 0;
    net.set(mint, current + amount);
  }

  return net;
}

function computeClusterNativeDeltaSol(parsed: any, cluster: Set<string>) {
  const accountKeys = getAccountKeys(parsed);
  const pre = Array.isArray(parsed?.raw?.meta?.preBalances) ? parsed.raw.meta.preBalances : [];
  const post = Array.isArray(parsed?.raw?.meta?.postBalances) ? parsed.raw.meta.postBalances : [];

  let deltaLamports = 0;
  for (let index = 0; index < accountKeys.length; index += 1) {
    const pubkey = getAccountKeyPubkey(accountKeys[index]);
    if (!pubkey || !cluster.has(pubkey.toLowerCase())) {
      continue;
    }

    const preBalance = toNumber(pre[index]) ?? 0;
    const postBalance = toNumber(post[index]) ?? 0;
    deltaLamports += postBalance - preBalance;
  }

  return deltaLamports / 1e9;
}

function pickLargestFlow(flows: TokenFlow[], predicate: (flow: TokenFlow) => boolean) {
  const filtered = flows.filter(predicate);
  if (filtered.length === 0) {
    return null;
  }

  filtered.sort((left, right) => right.amount - left.amount);
  return filtered[0];
}

function pickPreferredSolFlow(flows: TokenFlow[]) {
  const tokenFlow = pickLargestFlow(flows, (flow) => flow.mint === SOL_MINT);
  if (tokenFlow) {
    return tokenFlow;
  }

  const nativeFlow = pickLargestFlow(flows, (flow) => flow.mint === SOL_LITERAL);
  if (nativeFlow) {
    return nativeFlow;
  }

  return null;
}

function buildRelayerDirectOutput(
  signature: string,
  wallet: string,
  feePayer: string,
  timestamp: number | null,
  gas: number | null,
  directFlows: DirectWalletFlows
): EngineTradeOutput | null {
  const directReceivedNonBase = pickLargestFlow(directFlows.received, (flow) => !isBaseMint(flow.mint));
  const directSentNonBase = pickLargestFlow(directFlows.sent, (flow) => !isBaseMint(flow.mint));
  const directReceivedStable = pickLargestFlow(directFlows.received, (flow) => STABLECOIN_MINTS.has(flow.mint));
  const directSentStable = pickLargestFlow(directFlows.sent, (flow) => STABLECOIN_MINTS.has(flow.mint));
  const directReceivedSol = pickPreferredSolFlow(directFlows.received);
  const directSentSol = pickPreferredSolFlow(directFlows.sent);

  const canInferBuy = Boolean(directReceivedNonBase && directReceivedSol);
  const canInferSell = Boolean(directSentNonBase && directSentSol);

  if (canInferBuy && (directSentStable || !canInferSell)) {
    return {
      signature,
      wallet,
      feePayer,
      timestamp,
      type: 'buy',
      tokenMint: directReceivedNonBase!.mint,
      tokenAmount: directReceivedNonBase!.amount,
      baseAmount: deriveBaseAmount(SOL_MINT, directReceivedSol!.amount),
      tokenInMint: SOL_MINT,
      tokenInAmount: directReceivedSol!.amount,
      tokenOutMint: directReceivedNonBase!.mint,
      tokenOutAmount: directReceivedNonBase!.amount,
      gas,
    };
  }

  if (canInferSell && (directReceivedStable || !canInferBuy)) {
    return {
      signature,
      wallet,
      feePayer,
      timestamp,
      type: 'sell',
      tokenMint: directSentNonBase!.mint,
      tokenAmount: directSentNonBase!.amount,
      baseAmount: deriveBaseAmount(SOL_MINT, directSentSol!.amount),
      tokenInMint: directSentNonBase!.mint,
      tokenInAmount: directSentNonBase!.amount,
      tokenOutMint: SOL_MINT,
      tokenOutAmount: directSentSol!.amount,
      gas,
    };
  }

  if (canInferBuy) {
    return {
      signature,
      wallet,
      feePayer,
      timestamp,
      type: 'buy',
      tokenMint: directReceivedNonBase!.mint,
      tokenAmount: directReceivedNonBase!.amount,
      baseAmount: deriveBaseAmount(SOL_MINT, directReceivedSol!.amount),
      tokenInMint: SOL_MINT,
      tokenInAmount: directReceivedSol!.amount,
      tokenOutMint: directReceivedNonBase!.mint,
      tokenOutAmount: directReceivedNonBase!.amount,
      gas,
    };
  }

  if (canInferSell) {
    return {
      signature,
      wallet,
      feePayer,
      timestamp,
      type: 'sell',
      tokenMint: directSentNonBase!.mint,
      tokenAmount: directSentNonBase!.amount,
      baseAmount: deriveBaseAmount(SOL_MINT, directSentSol!.amount),
      tokenInMint: directSentNonBase!.mint,
      tokenInAmount: directSentNonBase!.amount,
      tokenOutMint: SOL_MINT,
      tokenOutAmount: directSentSol!.amount,
      gas,
    };
  }

  return null;
}

function shouldPreferRelayerDirectOutput(current: EngineTradeOutput | null, direct: EngineTradeOutput, directFlows: DirectWalletFlows) {
  if (!current) {
    return true;
  }

  if (current.type !== direct.type) {
    return true;
  }

  const directNonBaseMints = new Set(
    [...directFlows.sent, ...directFlows.received]
      .filter((flow) => !isBaseMint(flow.mint))
      .map((flow) => flow.mint)
  );

  const currentBaseMint = current.type === 'buy' ? current.tokenInMint : current.tokenOutMint;
  if (!directNonBaseMints.has(current.tokenMint)) {
    return true;
  }

  if (STABLECOIN_MINTS.has(currentBaseMint) && isSolLikeMint(direct.type === 'buy' ? direct.tokenInMint : direct.tokenOutMint)) {
    return true;
  }

  return false;
}

function chooseBestFlowPair(sent: TokenFlow[], received: TokenFlow[]) {
  const candidates: Array<{ input: TokenFlow; output: TokenFlow; score: number }> = [];

  for (const input of sent) {
    for (const output of received) {
      if (input.mint === output.mint) {
        continue;
      }

      const inputIsBase = isBaseMint(input.mint);
      const outputIsBase = isBaseMint(output.mint);
      const inputIsSol = isSolLikeMint(input.mint);
      const outputIsSol = isSolLikeMint(output.mint);

      let score = 0;
      if (inputIsBase !== outputIsBase) score += 20;
      if (inputIsBase && !outputIsBase) score += 12;
      if (!inputIsBase && outputIsBase) score += 12;
      if ((inputIsSol && !outputIsBase) || (!inputIsBase && outputIsSol)) score += 8;
      if (input.source === 'native' && !outputIsBase) score += 10;
      if (output.source === 'native' && !inputIsBase) score += 10;
      if (!inputIsBase && !outputIsBase) score -= 8;
      if (inputIsBase && outputIsBase) score -= 4;
      score += Math.min(input.amount, output.amount) > 0 ? 1 : 0;

      candidates.push({ input, output, score });
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  return candidates[0] || null;
}

function buildFromFlows(
  signature: string,
  wallet: string,
  feePayer: string,
  timestamp: number | null,
  gas: number | null,
  sent: TokenFlow[],
  received: TokenFlow[]
): EngineTradeOutput | null {
  if (sent.length > 0 && received.length > 0) {
    const choice = chooseBestFlowPair(sent, received);
    if (!choice) {
      return null;
    }

    const inFlow = choice.input;
    const outFlow = choice.output;

    const inIsBase = isBaseMint(inFlow.mint);
    const outIsBase = isBaseMint(outFlow.mint);

    if (inIsBase && !outIsBase) {
      return {
        signature,
        wallet,
        feePayer,
        timestamp,
        type: 'buy',
        tokenMint: outFlow.mint,
        tokenAmount: outFlow.amount,
        baseAmount: deriveBaseAmount(inFlow.mint, inFlow.amount),
        tokenInMint: inFlow.mint,
        tokenInAmount: inFlow.amount,
        tokenOutMint: outFlow.mint,
        tokenOutAmount: outFlow.amount,
        gas,
      };
    }

    if (!inIsBase && outIsBase) {
      return {
        signature,
        wallet,
        feePayer,
        timestamp,
        type: 'sell',
        tokenMint: inFlow.mint,
        tokenAmount: inFlow.amount,
        baseAmount: deriveBaseAmount(outFlow.mint, outFlow.amount),
        tokenInMint: inFlow.mint,
        tokenInAmount: inFlow.amount,
        tokenOutMint: outFlow.mint,
        tokenOutAmount: outFlow.amount,
        gas,
      };
    }

    if (inIsBase && outIsBase) {
      return {
        signature,
        wallet,
        feePayer,
        timestamp,
        type: 'buy',
        tokenMint: outFlow.mint,
        tokenAmount: outFlow.amount,
        baseAmount: deriveBaseAmount(inFlow.mint, inFlow.amount),
        tokenInMint: inFlow.mint,
        tokenInAmount: inFlow.amount,
        tokenOutMint: outFlow.mint,
        tokenOutAmount: outFlow.amount,
        gas,
      };
    }

    return {
      signature,
      wallet,
      feePayer,
      timestamp,
      type: 'sell',
      tokenMint: inFlow.mint,
      tokenAmount: inFlow.amount,
      baseAmount: null,
      tokenInMint: inFlow.mint,
      tokenInAmount: inFlow.amount,
      tokenOutMint: outFlow.mint,
      tokenOutAmount: outFlow.amount,
      gas,
    };
  }

  return null;
}

function buildFromSwapCandidate(
  signature: string,
  wallet: string,
  feePayer: string,
  timestamp: number | null,
  gas: number | null,
  candidate: FlowCandidate,
  explicitSolTokenNet: number,
  nativeTradeDeltaSol: number
): EngineTradeOutput | null {
  let inputMint = candidate.inputMint;
  let inputAmount = candidate.inputAmount;
  let outputMint = candidate.outputMint;
  let outputAmount = candidate.outputAmount;
  const isRelayer = feePayer.toLowerCase() !== wallet.toLowerCase();
  const nativeBaseMint = isRelayer ? SOL_MINT : SOL_LITERAL;

  if (isSolLikeMint(inputMint)) {
    if (Math.abs(explicitSolTokenNet) > 1e-9) {
      inputMint = SOL_MINT;
      inputAmount = Math.abs(explicitSolTokenNet);
    } else {
      inputMint = nativeBaseMint;
      inputAmount = Math.abs(nativeTradeDeltaSol);
    }
  }

  if (isSolLikeMint(outputMint)) {
    if (Math.abs(explicitSolTokenNet) > 1e-9) {
      outputMint = SOL_MINT;
      outputAmount = Math.abs(explicitSolTokenNet);
    } else {
      outputMint = nativeBaseMint;
      outputAmount = Math.abs(nativeTradeDeltaSol);
    }
  }

  if (!inputMint || !outputMint || !inputAmount || !outputAmount) {
    return null;
  }

  return buildFromFlows(
    signature,
    wallet,
    feePayer,
    timestamp,
    gas,
    [{ mint: inputMint, amount: inputAmount, source: isSolLikeMint(inputMint) ? 'native' : 'token' }],
    [{ mint: outputMint, amount: outputAmount, source: isSolLikeMint(outputMint) ? 'native' : 'token' }]
  );
}

function buildFromRawFlowCandidate(
  signature: string,
  wallet: string,
  feePayer: string,
  timestamp: number | null,
  gas: number | null,
  candidate: FlowCandidate
) {
  const inputMint = isSolLikeMint(candidate.inputMint) ? SOL_MINT : candidate.inputMint;
  const outputMint = isSolLikeMint(candidate.outputMint) ? SOL_MINT : candidate.outputMint;

  return buildFromFlows(
    signature,
    wallet,
    feePayer,
    timestamp,
    gas,
    [{ mint: inputMint, amount: candidate.inputAmount, source: isSolLikeMint(candidate.inputMint) ? 'native' : 'token' }],
    [{ mint: outputMint, amount: candidate.outputAmount, source: isSolLikeMint(candidate.outputMint) ? 'native' : 'token' }]
  );
}

function buildRelayerWalletSwapLegOutput(
  parsed: any,
  signature: string,
  wallet: string,
  feePayer: string,
  timestamp: number | null,
  gas: number | null,
  directWalletFlows: DirectWalletFlows
) {
  const receivedNonBaseMints = new Set(
    directWalletFlows.received.filter((flow) => !isBaseMint(flow.mint)).map((flow) => flow.mint)
  );
  const sentNonBaseMints = new Set(
    directWalletFlows.sent.filter((flow) => !isBaseMint(flow.mint)).map((flow) => flow.mint)
  );

  const actions: any[] = Array.isArray(parsed?.actions) ? parsed.actions : [];
  const candidates: Array<{ candidate: FlowCandidate; score: number }> = [];

  for (const action of actions) {
    const legs: any[] = Array.isArray(action?.info?.swaps) ? action.info.swaps : [];
    for (const leg of legs) {
      const candidate = buildSwapFlowCandidate(
        leg?.in?.token_address,
        leg?.in?.amount,
        leg?.out?.token_address,
        leg?.out?.amount,
        'swap_leg'
      );
      if (!candidate) {
        continue;
      }

      let score = 0;
      if (isSolLikeMint(candidate.inputMint) && receivedNonBaseMints.has(candidate.outputMint)) {
        score += 20;
      }
      if (isSolLikeMint(candidate.outputMint) && sentNonBaseMints.has(candidate.inputMint)) {
        score += 12;
      }

      if (score > 0) {
        candidates.push({ candidate, score });
      }
    }
  }

  candidates.sort((left, right) => right.score - left.score);
  if (!candidates[0]) {
    return null;
  }

  return buildFromRawFlowCandidate(
    signature,
    wallet,
    feePayer,
    timestamp,
    gas,
    candidates[0].candidate
  );
}

export function adaptShyftParsedTx(parsed: any, wallet: string): AdaptedTradeRecord {
  const signature = Array.isArray(parsed?.signatures) ? parsed.signatures[0] : parsed?.signature || '';
  const feePayer = typeof parsed?.fee_payer === 'string' ? parsed.fee_payer : '';
  const timestamp = getTimestamp(parsed);
  const feeLamports = getFeeLamports(parsed);
  const gas = feeLamports !== null ? feeLamports / 1e9 : null;
  const cluster = new Set([wallet.toLowerCase(), feePayer.toLowerCase()].filter(Boolean));
  const actionTypeCounts = aggregateActionTypeCounts(parsed);
  const swapLikeActionPresent = hasSwapLikeAction(parsed);
  const clusterTokenChangeByMint = aggregateClusterTokenBalanceChanges(parsed, cluster);
  const tokenNet = aggregateClusterTokenNet(parsed, cluster);
  const directWalletFlows = extractDirectWalletFlows(parsed, wallet);
  const explicitSolTokenNet = tokenNet.get(SOL_MINT) || 0;
  const nativeClusterDeltaSol = computeClusterNativeDeltaSol(parsed, cluster);
  const nativeTradeDeltaSol = nativeClusterDeltaSol + ((feeLamports || 0) / 1e9);
  const isRelayer = feePayer.toLowerCase() !== wallet.toLowerCase();
  const nativeBaseMint = isRelayer ? SOL_MINT : SOL_LITERAL;
  const notes: string[] = [];

  if (Math.abs(nativeTradeDeltaSol) > NATIVE_EPSILON && Math.abs(explicitSolTokenNet) <= 1e-9) {
    tokenNet.set(nativeBaseMint, nativeTradeDeltaSol);
  }

  const swapCandidate = chooseSwapCandidate(parsed, wallet, feePayer, tokenNet, nativeTradeDeltaSol, clusterTokenChangeByMint);
  let swapOutput: EngineTradeOutput | null = null;
  if (swapCandidate) {
    swapOutput = buildFromSwapCandidate(
      signature,
      wallet,
      feePayer,
      timestamp,
      gas,
      swapCandidate,
      explicitSolTokenNet,
      nativeTradeDeltaSol
    );
    if (!swapOutput) {
      notes.push('swap_candidate_present_but_unusable');
    }
  }

  const relayerDirectOutput = isRelayer
    ? buildRelayerDirectOutput(signature, wallet, feePayer, timestamp, gas, directWalletFlows)
    : null;
  if (relayerDirectOutput?.type === 'buy' && (!swapOutput || swapOutput.type !== 'buy')) {
    return {
      signature,
      wallet,
      parsed: relayerDirectOutput,
      meta: {
        path: 'net_transfers',
        feePayer: feePayer || null,
        nativeClusterDeltaSol,
        nativeTradeDeltaSol,
        tokenNetByMint: Object.fromEntries(tokenNet),
        actionTypeCounts,
        notes: [...notes, 'used_relayer_direct_wallet_heuristic'],
      },
    };
  }

  const relayerSwapLegOutput = isRelayer
    ? buildRelayerWalletSwapLegOutput(parsed, signature, wallet, feePayer, timestamp, gas, directWalletFlows)
    : null;
  if (relayerSwapLegOutput) {
    return {
      signature,
      wallet,
      parsed: relayerSwapLegOutput,
      meta: {
        path: 'swap_action',
        feePayer: feePayer || null,
        nativeClusterDeltaSol,
        nativeTradeDeltaSol,
        tokenNetByMint: Object.fromEntries(tokenNet),
        actionTypeCounts,
        notes: [...notes, 'used_relayer_nested_swap_leg'],
      },
    };
  }

  if (relayerDirectOutput && shouldPreferRelayerDirectOutput(swapOutput, relayerDirectOutput, directWalletFlows)) {
    return {
      signature,
      wallet,
      parsed: relayerDirectOutput,
      meta: {
        path: 'net_transfers',
        feePayer: feePayer || null,
        nativeClusterDeltaSol,
        nativeTradeDeltaSol,
        tokenNetByMint: Object.fromEntries(tokenNet),
        actionTypeCounts,
        notes: [...notes, 'used_relayer_direct_wallet_heuristic'],
      },
    };
  }

  if (swapOutput) {
    return {
      signature,
      wallet,
      parsed: swapOutput,
      meta: {
        path: 'swap_action',
        feePayer: feePayer || null,
        nativeClusterDeltaSol,
        nativeTradeDeltaSol,
        tokenNetByMint: Object.fromEntries(tokenNet),
        actionTypeCounts,
        notes,
      },
    };
  }

  const sent: TokenFlow[] = [];
  const received: TokenFlow[] = [];
  for (const [mint, netAmount] of tokenNet.entries()) {
    if (Math.abs(netAmount) <= 1e-9) {
      continue;
    }

    if (netAmount > 0) {
      received.push({ mint, amount: netAmount, source: mint === SOL_LITERAL ? 'native' : 'token' });
    } else {
      sent.push({ mint, amount: Math.abs(netAmount), source: mint === SOL_LITERAL ? 'native' : 'token' });
    }
  }

  const hasNonBaseReceived = received.some((flow) => !isBaseMint(flow.mint));
  const hasNonBaseSent = sent.some((flow) => !isBaseMint(flow.mint));
  const hasNativeSent = sent.some((flow) => flow.mint === SOL_LITERAL || flow.mint === SOL_MINT);
  const hasNativeReceived = received.some((flow) => flow.mint === SOL_LITERAL || flow.mint === SOL_MINT);

  if (!hasNativeSent && Math.abs(explicitSolTokenNet) <= 1e-9 && hasNonBaseReceived && nativeTradeDeltaSol < -NATIVE_EPSILON) {
    sent.push({ mint: nativeBaseMint, amount: Math.abs(nativeTradeDeltaSol), source: 'native' });
  }

  if (!hasNativeReceived && Math.abs(explicitSolTokenNet) <= 1e-9 && hasNonBaseSent && nativeTradeDeltaSol > NATIVE_EPSILON) {
    received.push({ mint: nativeBaseMint, amount: nativeTradeDeltaSol, source: 'native' });
  }

  const netOutput = buildFromFlows(signature, wallet, feePayer, timestamp, gas, sent, received);
  if (netOutput) {
    if (!swapLikeActionPresent && !isRelayer) {
      if (netOutput.type === 'buy' && netOutput.tokenInMint === SOL_MINT) {
        const directSentSol = pickPreferredSolFlow(directWalletFlows.sent);
        if (directSentSol) {
          netOutput.tokenInAmount = directSentSol.amount;
        }
      }
      if (netOutput.type === 'sell' && netOutput.tokenOutMint === SOL_MINT) {
        const directReceivedSol = pickPreferredSolFlow(directWalletFlows.received);
        if (directReceivedSol) {
          netOutput.tokenOutAmount = directReceivedSol.amount;
        }
      }
    } else if (!swapLikeActionPresent && Math.abs(explicitSolTokenNet) > 1e-9 && Math.abs(nativeTradeDeltaSol) > NATIVE_EPSILON) {
      if (netOutput.type === 'buy' && netOutput.tokenInMint === SOL_MINT) {
        netOutput.tokenInAmount = Math.abs(nativeTradeDeltaSol);
      }
      if (netOutput.type === 'sell' && netOutput.tokenOutMint === SOL_MINT) {
        netOutput.tokenOutAmount = Math.abs(nativeTradeDeltaSol);
      }
    }

    return {
      signature,
      wallet,
      parsed: netOutput,
      meta: {
        path: 'net_transfers',
        feePayer: feePayer || null,
        nativeClusterDeltaSol,
        nativeTradeDeltaSol,
        tokenNetByMint: Object.fromEntries(tokenNet),
        actionTypeCounts,
        notes,
      },
    };
  }

  notes.push('unable_to_classify');
  return {
    signature,
    wallet,
    parsed: null,
    meta: {
      path: 'unparsed',
      feePayer: feePayer || null,
      nativeClusterDeltaSol,
      nativeTradeDeltaSol,
      tokenNetByMint: Object.fromEntries(tokenNet),
      actionTypeCounts,
      notes,
    },
  };
}
