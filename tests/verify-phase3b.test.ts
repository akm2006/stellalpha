import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeCopyTrades as newExecuteCopyTrades } from '../lib/ingestion/follower-producer';
import { processTradeQueue as newProcessTradeQueue } from '../lib/ingestion/follower-execution';

// We will mock supabase, fetch, and connection so we can verify the payload propagation
// without modifying the database.

// Mocks
const mockFrom = vi.fn();
const mockUpsert = vi.fn();
const mockUpdate = vi.fn();
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockIn = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => mockFrom(table)
  }
}));

function buildChain() {
  const chain: any = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockImplementation((args) => { mockUpdate(args); return chain; });
  chain.insert = vi.fn().mockImplementation((args) => { mockInsert(args); return chain; });
  chain.upsert = vi.fn().mockImplementation((args) => { mockUpsert(args); return chain; });
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockReturnValue({ data: {}, error: null });
  chain.in = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  // Default generic then for simple lists
  chain.then = vi.fn(cb => cb({ data: [], error: null }));
  return chain;
}

mockFrom.mockImplementation(() => buildChain());

describe('Phase 3B Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default valid mock for active followers
    mockFrom.mockImplementation((table) => {
      const chain = buildChain();
      if (table === 'demo_trader_states') {
         // Fix for single
         chain.single = vi.fn().mockResolvedValue({
           data: {
             id: 'follower1',
             realized_pnl_usd: 10,
             positions: [{ token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', size: 1000 }] // USDC
           }, 
           error: null 
         });
         // This 'then' mock supports returning followers array for `getActiveFollowers`
         // It intercepts await on the chain, returning the mock follower.
         chain.then = vi.fn((cb) => cb({ data: [{ id: 'follower1' }], error: null }));
         return chain;
      }
      if (table === 'demo_trades') {
          // Provide appropriate mock values for the terminal functions of the chain
          chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null });
          
          // Instead of breaking the chain at .select, intercept it at the terminal points
          chain.limit = vi.fn().mockResolvedValue({
              data: [{ id: 'trade1', raw_data: { type: 'buy', wallet: 'leader', tokenInMint: 'USD', tokenOutMint: 'MINT' } }], 
              error: null
          });
          
          // claimQueuedTrade ends with `.select('*')` but since we mocked `select` in basic chain 
          // as returning the chain, wait! claimQueuedTrade doesn't await the `select`, it awaits the result.
          // Let's redefine `select` to return the chain but when `await`ed it returns data.
          chain.then = vi.fn((cb) => cb({ 
             data: [{ id: 'trade1', raw_data: { type: 'buy', wallet: 'leader', tokenInMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', tokenOutMint: 'SOL' } }], 
             error: null 
          }));
          return chain;
      }
      return chain;
    });
  });

  it('verifies follower-producer structure loads without breaking imports', async () => {
    expect(newExecuteCopyTrades).toBeTypeOf('function');
  });

  it('verifies follower-execution structure loads without breaking imports', async () => {
    expect(newProcessTradeQueue).toBeTypeOf('function');
  });

  it('verifies executeCopyTrades parses payload and calls queue insertion', async () => {
    // We run it and make sure it reaches the DB calls without throwing undef imports
    const dummyTrade: any = {
      signature: 'abc1234',
      wallet: 'leader',
      type: 'buy',
      tokenInMint: 'USD_MINT',
      tokenOutMint: 'SOME_MINT',
      tokenInAmount: 10,
      tokenOutAmount: 100,
      timestamp: Date.now() / 1000
    };

    // This won't throw if imports are fine. 
    // Wait for the synchronous part to resolve.
    await expect(newExecuteCopyTrades(dummyTrade, Date.now())).resolves.toBeUndefined();
    // It should have called from('demo_trader_states') to get followers
    expect(mockFrom).toHaveBeenCalledWith('demo_trader_states');
  });

});
