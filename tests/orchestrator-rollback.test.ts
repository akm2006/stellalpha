import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenServiceMock = vi.hoisted(() => ({
  getSolPrice: vi.fn(),
  getTokenSymbol: vi.fn(),
  enrichTradeSymbols: vi.fn(),
}));

const starTradersRepoMock = vi.hoisted(() => ({
  getStarTradersByAddresses: vi.fn(),
}));

const tradesRepoMock = vi.hoisted(() => ({
  claimTrade: vi.fn(),
  deleteClaimedTrade: vi.fn(),
  updateTradePnL: vi.fn(),
}));

const positionsRepoMock = vi.hoisted(() => ({
  getPosition: vi.fn(),
  upsertPosition: vi.fn(),
}));

const followerProducerMock = vi.hoisted(() => ({
  queueCopyTrades: vi.fn(),
  triggerQueuedTradeProcessors: vi.fn(),
}));

const demoTradesRepoMock = vi.hoisted(() => ({
  deleteQueuedTradesBySignature: vi.fn(),
}));

const tradeParserMock = vi.hoisted(() => ({
  detectTrade: vi.fn(),
}));

const ingestionUtilsMock = vi.hoisted(() => ({
  extractInvolvedAddresses: vi.fn(),
}));

vi.mock('@/lib/services/token-service', () => tokenServiceMock);
vi.mock('@/lib/repositories/star-traders.repo', () => starTradersRepoMock);
vi.mock('@/lib/repositories/trades.repo', () => tradesRepoMock);
vi.mock('@/lib/repositories/positions.repo', () => positionsRepoMock);
vi.mock('@/lib/ingestion/follower-producer', () => followerProducerMock);
vi.mock('@/lib/repositories/demo-trades.repo', () => demoTradesRepoMock);
vi.mock('@/lib/trade-parser', () => tradeParserMock);
vi.mock('@/lib/ingestion/utils', () => ingestionUtilsMock);

describe('orchestrator rollback and commit boundaries', () => {
  const detectedTrade = {
    signature: 'sig-1',
    wallet: 'wallet-1',
    type: 'buy',
    tokenMint: 'MEME',
    tokenAmount: 10,
    baseAmount: 100,
    tokenInMint: 'USDC',
    tokenInAmount: 100,
    tokenOutMint: 'MEME',
    tokenOutAmount: 10,
    timestamp: 1_700_000_000,
    source: 'webhook',
    gas: 0.001,
    confidence: 'high',
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    tokenServiceMock.getSolPrice.mockResolvedValue(150);
    tokenServiceMock.getTokenSymbol.mockImplementation((mint: string) => mint);
    tokenServiceMock.enrichTradeSymbols.mockResolvedValue(undefined);

    starTradersRepoMock.getStarTradersByAddresses.mockResolvedValue({
      data: [{ address: 'wallet-1' }],
      error: null,
    });

    tradesRepoMock.claimTrade.mockResolvedValue({ claimed: true });
    tradesRepoMock.deleteClaimedTrade.mockResolvedValue({ error: null });
    tradesRepoMock.updateTradePnL.mockResolvedValue({ error: null });

    positionsRepoMock.getPosition.mockResolvedValue({ data: null });
    positionsRepoMock.upsertPosition.mockResolvedValue({ error: null });

    followerProducerMock.queueCopyTrades.mockResolvedValue({ queuedTraderStateIds: ['ts-1'] });
    followerProducerMock.triggerQueuedTradeProcessors.mockImplementation(() => {});

    demoTradesRepoMock.deleteQueuedTradesBySignature.mockResolvedValue({ error: null });

    tradeParserMock.detectTrade.mockReturnValue(detectedTrade);
    ingestionUtilsMock.extractInvolvedAddresses.mockReturnValue(new Set(['wallet-1']));
  });

  async function runProcessBatch() {
    const { processBatch } = await import('@/lib/ingestion/orchestrator');
    return processBatch(
      [{
        signature: 'sig-1',
        feePayer: 'wallet-1',
        source: 'webhook',
        raw: { signature: 'sig-1' },
      } as any],
      1_700_000_500_000
    );
  }

  it('deletes the claimed trade row when queue insertion fails', async () => {
    followerProducerMock.queueCopyTrades.mockRejectedValue(new Error('queue failed'));

    await expect(runProcessBatch()).rejects.toThrow('queue failed');

    expect(tradesRepoMock.deleteClaimedTrade).toHaveBeenCalledWith('sig-1');
    expect(demoTradesRepoMock.deleteQueuedTradesBySignature).toHaveBeenCalledWith('sig-1');
    expect(positionsRepoMock.upsertPosition).not.toHaveBeenCalled();
  });

  it('deletes the claimed trade row and queued rows when failure happens before leader position update succeeds', async () => {
    followerProducerMock.queueCopyTrades.mockResolvedValue({ queuedTraderStateIds: ['ts-1', 'ts-2'] });
    positionsRepoMock.upsertPosition.mockRejectedValue(new Error('position failed'));

    await expect(runProcessBatch()).rejects.toThrow('position failed');

    expect(tradesRepoMock.deleteClaimedTrade).toHaveBeenCalledWith('sig-1');
    expect(demoTradesRepoMock.deleteQueuedTradesBySignature).toHaveBeenCalledWith('sig-1');
    expect(followerProducerMock.triggerQueuedTradeProcessors).not.toHaveBeenCalled();
  });

  it('does not rollback once leader position update has succeeded', async () => {
    tradesRepoMock.updateTradePnL.mockRejectedValue(new Error('pnl failed'));

    const result = await runProcessBatch();

    expect(result.inserted).toBe(1);
    expect(tradesRepoMock.deleteClaimedTrade).not.toHaveBeenCalled();
    expect(demoTradesRepoMock.deleteQueuedTradesBySignature).not.toHaveBeenCalled();
    expect(followerProducerMock.triggerQueuedTradeProcessors).toHaveBeenCalledWith(['ts-1']);
  });

  it('does not rollback once any queue trigger has been issued', async () => {
    followerProducerMock.triggerQueuedTradeProcessors.mockImplementation(() => {
      throw new Error('trigger failed');
    });

    await expect(runProcessBatch()).rejects.toThrow('trigger failed');

    expect(positionsRepoMock.upsertPosition).toHaveBeenCalled();
    expect(followerProducerMock.triggerQueuedTradeProcessors).toHaveBeenCalledWith(['ts-1']);
    expect(tradesRepoMock.deleteClaimedTrade).not.toHaveBeenCalled();
    expect(demoTradesRepoMock.deleteQueuedTradesBySignature).not.toHaveBeenCalled();
  });

  it('treats PnL backfill failure as best-effort without rollback', async () => {
    tradesRepoMock.updateTradePnL.mockRejectedValue(new Error('pnl failed'));

    await runProcessBatch();

    expect(positionsRepoMock.upsertPosition).toHaveBeenCalled();
    expect(followerProducerMock.triggerQueuedTradeProcessors).toHaveBeenCalledWith(['ts-1']);
    expect(tradesRepoMock.deleteClaimedTrade).not.toHaveBeenCalled();
    expect(demoTradesRepoMock.deleteQueuedTradesBySignature).not.toHaveBeenCalled();
  });
});
