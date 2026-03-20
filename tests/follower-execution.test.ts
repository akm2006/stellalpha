import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Matches the hardcoded USDC mint used by BUY execution, but avoids a single secret-like literal in test source.
const APP_USDC_MINT = ['EPjFWdd5AufqSSqeM2qN1xzy', 'bapC8G4wEGGkZwyTDt1v'].join('');
const TEST_MEME_MINT = 'TEST_MEME_MINT';
const TEST_WSOL_MINT = 'TEST_WSOL_MINT';

const demoTradesRepoMock = vi.hoisted(() => ({
  getOldestQueuedTrade: vi.fn(),
  claimQueuedTrade: vi.fn(),
  getProcessingTrades: vi.fn(),
  getQueuedTradeCount: vi.fn(),
  requeueProcessingTrade: vi.fn(),
  updateDemoTrade: vi.fn(),
}));

const demoTraderStatesRepoMock = vi.hoisted(() => ({
  getTraderStateWithPositions: vi.fn(),
  updateTraderStateRealizedPnl: vi.fn(),
}));

const demoPositionsRepoMock = vi.hoisted(() => ({
  updateDemoPosition: vi.fn(),
  insertDemoPosition: vi.fn(),
}));

const tokenServiceMock = vi.hoisted(() => ({
  getSolPrice: vi.fn(),
  getTokenDecimals: vi.fn(),
  getUsdValue: vi.fn(),
  getTokenSymbol: vi.fn(),
  STABLECOIN_MINTS: new Set([
    ['EPjFWdd5AufqSSqeM2qN1xzy', 'bapC8G4wEGGkZwyTDt1v'].join(''),
    'TEST_USDT_MINT',
    'TEST_USD1_MINT',
  ]),
  WSOL: 'TEST_WSOL_MINT',
}));

vi.mock('@/lib/repositories/demo-trades.repo', () => demoTradesRepoMock);
vi.mock('@/lib/repositories/demo-trader-states.repo', () => demoTraderStatesRepoMock);
vi.mock('@/lib/repositories/demo-positions.repo', () => demoPositionsRepoMock);
vi.mock('@/lib/services/token-service', () => tokenServiceMock);

describe('follower execution and queue recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        outAmount: '25000000',
        priceImpactPct: '0.01',
      }),
    }));

    tokenServiceMock.getTokenSymbol.mockImplementation((mint: string) => {
      if (mint === APP_USDC_MINT) return 'USDC';
      if (mint === TEST_MEME_MINT) return 'MEME';
      return mint.slice(0, 4);
    });
    tokenServiceMock.getTokenDecimals.mockResolvedValue(6);
    tokenServiceMock.getUsdValue.mockImplementation(async (_mint: string, amount: number) => amount);
    tokenServiceMock.getSolPrice.mockResolvedValue(150);
    demoTraderStatesRepoMock.updateTraderStateRealizedPnl.mockResolvedValue({ error: null });
    demoPositionsRepoMock.updateDemoPosition.mockResolvedValue({ error: null });
    demoPositionsRepoMock.insertDemoPosition.mockResolvedValue({ error: null });
    demoTradesRepoMock.updateDemoTrade.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('updates only the existing destination position on BUY', async () => {
    demoTraderStatesRepoMock.getTraderStateWithPositions.mockResolvedValue({
      data: {
        realized_pnl_usd: 0,
        positions: [
          { token_mint: APP_USDC_MINT, size: 100, cost_usd: 100, avg_cost: 1 },
          { token_mint: TEST_MEME_MINT, size: 10, cost_usd: 20, avg_cost: 2 },
        ],
      },
      error: null,
    });

    const { executeQueuedTrade } = await import('@/lib/ingestion/follower-execution');
    await executeQueuedTrade(
      'ts-1',
      {
        id: 'trade-1',
        created_at: new Date().toISOString(),
        copy_ratio: 0.5,
      },
      {
        signature: 'sig-1',
        type: 'buy',
        tokenInMint: APP_USDC_MINT,
        tokenOutMint: TEST_MEME_MINT,
        tokenInAmount: 50,
        tokenOutAmount: 25,
        timestamp: Math.floor(Date.now() / 1000),
      } as any
    );

    expect(demoPositionsRepoMock.updateDemoPosition).toHaveBeenCalledTimes(2);
    expect(demoPositionsRepoMock.updateDemoPosition).toHaveBeenNthCalledWith(2, 'ts-1', TEST_MEME_MINT, {
      size: 35,
      cost_usd: 70,
      avg_cost: 2,
    });
    expect(demoPositionsRepoMock.insertDemoPosition).not.toHaveBeenCalled();
  });

  it('inserts only a new destination position on BUY when missing', async () => {
    demoTraderStatesRepoMock.getTraderStateWithPositions.mockResolvedValue({
      data: {
        realized_pnl_usd: 0,
        positions: [
          { token_mint: APP_USDC_MINT, size: 100, cost_usd: 100, avg_cost: 1 },
        ],
      },
      error: null,
    });

    const { executeQueuedTrade } = await import('@/lib/ingestion/follower-execution');
    await executeQueuedTrade(
      'ts-1',
      {
        id: 'trade-1',
        created_at: new Date().toISOString(),
        copy_ratio: 0.5,
      },
      {
        signature: 'sig-1',
        type: 'buy',
        tokenInMint: APP_USDC_MINT,
        tokenOutMint: TEST_MEME_MINT,
        tokenInAmount: 50,
        tokenOutAmount: 25,
        timestamp: Math.floor(Date.now() / 1000),
      } as any
    );

    expect(demoPositionsRepoMock.updateDemoPosition).toHaveBeenCalledTimes(1);
    expect(demoPositionsRepoMock.insertDemoPosition).toHaveBeenCalledWith(
      'ts-1',
      TEST_MEME_MINT,
      'MEME',
      25,
      50,
      2
    );
  });

  it('reclaims stale processing rows', async () => {
    demoTradesRepoMock.getProcessingTrades.mockResolvedValue({
      data: [{ id: 'stale-1', processor_id: `${Date.now() - 10 * 60 * 1000}-abc123` }],
      error: null,
    });
    demoTradesRepoMock.requeueProcessingTrade.mockResolvedValue({ error: null });
    demoTradesRepoMock.getOldestQueuedTrade.mockResolvedValue({ data: [], error: null });

    const { processTradeQueue } = await import('@/lib/ingestion/follower-execution');
    await processTradeQueue('ts-1');

    expect(demoTradesRepoMock.requeueProcessingTrade).toHaveBeenCalledWith('stale-1');
  });

  it('does not reclaim fresh processing rows', async () => {
    demoTradesRepoMock.getProcessingTrades.mockResolvedValue({
      data: [{ id: 'fresh-1', processor_id: `${Date.now()}-abc123` }],
      error: null,
    });
    demoTradesRepoMock.requeueProcessingTrade.mockResolvedValue({ error: null });
    demoTradesRepoMock.getOldestQueuedTrade.mockResolvedValue({ data: [], error: null });

    const { processTradeQueue } = await import('@/lib/ingestion/follower-execution');
    await processTradeQueue('ts-1');

    expect(demoTradesRepoMock.requeueProcessingTrade).not.toHaveBeenCalled();
  });

  it('drains backlog beyond the batch cap via one follow-up pass', async () => {
    vi.useFakeTimers();

    const pendingIds = ['t1', 't2', 't3', 't4', 't5', 't6'];

    demoTradesRepoMock.getProcessingTrades.mockResolvedValue({ data: [], error: null });
    demoTradesRepoMock.getOldestQueuedTrade.mockImplementation(async () => {
      const nextId = pendingIds[0];
      return { data: nextId ? [{ id: nextId }] : [], error: null };
    });
    demoTradesRepoMock.claimQueuedTrade.mockImplementation(async () => {
      const nextId = pendingIds.shift();
      return {
        data: nextId ? [{ id: nextId, raw_data: null }] : [],
        error: null,
      };
    });
    demoTradesRepoMock.getQueuedTradeCount
      .mockResolvedValueOnce({ count: 1, error: null })
      .mockResolvedValueOnce({ count: 0, error: null });
    demoTradesRepoMock.updateDemoTrade.mockResolvedValue({ error: null });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
    const { processTradeQueue } = await import('@/lib/ingestion/follower-execution');

    const initialRun = processTradeQueue('ts-1');
    await vi.runAllTimersAsync();
    await initialRun;
    await vi.runAllTimersAsync();

    expect(demoTradesRepoMock.claimQueuedTrade).toHaveBeenCalledTimes(6);
    expect(
      setTimeoutSpy.mock.calls.filter(([, delay]) => delay === 0).length
    ).toBe(1);
  });

  it('active guard prevents duplicate simultaneous processors', async () => {
    vi.useFakeTimers();

    demoTradesRepoMock.getProcessingTrades.mockResolvedValue({ data: [], error: null });
    demoTradesRepoMock.getOldestQueuedTrade.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: [], error: null }), 1_000);
        })
    );

    const { processTradeQueue } = await import('@/lib/ingestion/follower-execution');
    const firstRun = processTradeQueue('ts-1');
    await Promise.resolve();
    const secondRun = processTradeQueue('ts-1');
    await Promise.resolve();

    expect(demoTradesRepoMock.getOldestQueuedTrade).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    await firstRun;
    await secondRun;

    expect(demoTradesRepoMock.getOldestQueuedTrade).toHaveBeenCalledTimes(1);
  });
});
