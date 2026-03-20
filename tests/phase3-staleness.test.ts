import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCopyTrades } from '../lib/ingestion/follower-producer';
import * as traderStatesRepo from '../lib/repositories/demo-trader-states.repo';
import * as tradesRepo from '../lib/repositories/demo-trades.repo';
import * as positionsRepo from '../lib/repositories/demo-positions.repo';

vi.mock('../lib/repositories/demo-trader-states.repo');
vi.mock('../lib/repositories/demo-trades.repo');
vi.mock('../lib/repositories/demo-positions.repo');
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
    })
  }
}));
vi.mock('../lib/ingestion/follower-execution', () => ({
  processTradeQueue: vi.fn().mockResolvedValue(undefined)
}));

describe('Phase 3 Staleness Policy', () => {
  const mockTrader = { id: 'trader1', address: 'addr1' };
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(traderStatesRepo, 'getActiveFollowers').mockResolvedValue({ data: [mockTrader], error: null } as any);
  });

  it('skips a stale BUY when the follower has NO position', async () => {
    const staleTime = Date.now() - 40_000; // 40s old (> 30s)
    const staleTrade: any = {
      signature: 'stale-buy-1',
      type: 'buy',
      timestamp: staleTime / 1000,
      tokenInMint: 'USDC',
      tokenOutMint: 'MEME',
      tokenInAmount: 100,
      tokenOutAmount: 1000,
      wallet: 'leader'
    };

    // Mock: Follower has NO position
    vi.spyOn(positionsRepo, 'getFollowerPosition').mockResolvedValue({ data: null, error: null } as any);

    await executeCopyTrades(staleTrade, Date.now());

    // Should NOT have queued the trade
    expect(tradesRepo.queueTrade).not.toHaveBeenCalled();
  });

  it('allows a stale BUY when the follower DOES have a position', async () => {
    const staleTime = Date.now() - 40_000; // 40s old (> 30s)
    const staleTrade: any = {
      signature: 'stale-buy-2',
      type: 'buy',
      timestamp: staleTime / 1000,
      tokenInMint: 'USDC',
      tokenOutMint: 'MEME',
      tokenInAmount: 100,
      tokenOutAmount: 1000,
      wallet: 'leader'
    };

    // Mock: Follower HAS a position
    vi.spyOn(positionsRepo, 'getFollowerPosition').mockResolvedValue({ 
      data: { size: '100', cost_usd: '10' }, 
      error: null 
    } as any);
    vi.spyOn(tradesRepo, 'queueTrade').mockResolvedValue({ data: {}, error: null } as any);

    await executeCopyTrades(staleTrade, Date.now());

    // SHOULD have queued the trade to maintain consistency
    expect(tradesRepo.queueTrade).toHaveBeenCalled();
  });

  it('allows a FRESH BUY regardless of position', async () => {
    const freshTime = Date.now() - 5_000; // 5s old (< 30s)
    const freshTrade: any = {
      signature: 'fresh-buy-1',
      type: 'buy',
      timestamp: freshTime / 1000,
      tokenInMint: 'USDC',
      tokenOutMint: 'MEME',
      tokenInAmount: 100,
      tokenOutAmount: 1000,
      wallet: 'leader'
    };

    // Mock: Follower has NO position
    vi.spyOn(positionsRepo, 'getFollowerPosition').mockResolvedValue({ data: null, error: null } as any);
    vi.spyOn(tradesRepo, 'queueTrade').mockResolvedValue({ data: {}, error: null } as any);

    await executeCopyTrades(freshTrade, Date.now());

    // SHOULD have queued the trade
    expect(tradesRepo.queueTrade).toHaveBeenCalled();
  });

  it('always allows a SELL regardless of staleness if position exists', async () => {
    const staleTime = Date.now() - 60_000; // 60s old
    const staleSell: any = {
      signature: 'stale-sell-1',
      type: 'sell',
      timestamp: staleTime / 1000,
      tokenInMint: 'MEME',
      tokenOutMint: 'USDC',
      tokenInAmount: 1000,
      tokenOutAmount: 110,
      wallet: 'leader'
    };

    vi.spyOn(tradesRepo, 'queueTrade').mockResolvedValue({ data: {}, error: null } as any);

    await executeCopyTrades(staleSell, Date.now());

    // SHOULD have queued the trade (SELLs are not blocked by staleness)
    expect(tradesRepo.queueTrade).toHaveBeenCalled();
  });
});
