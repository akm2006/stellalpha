import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

const getSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/lib/session', () => ({
  getSession: getSessionMock,
}));

function createThenable<T>(value: T) {
  return {
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(value)),
  };
}

describe('demo vault egress-focused routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('demo-vault route batches trader-state trade stats through one RPC call', async () => {
    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'demo_vaults') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'vault-1',
                  user_wallet: 'wallet-1',
                  balance_usd: 500,
                  total_deposited: 1000,
                  created_at: '2026-03-21T00:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'demo_trader_states') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(createThenable({
              data: [
                {
                  id: 'ts-1',
                  star_trader: 'star-1',
                  allocated_usd: 100,
                  realized_pnl_usd: 5,
                  is_syncing: false,
                  is_initialized: true,
                  is_paused: false,
                  is_settled: false,
                  positions: [
                    {
                      token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                      token_symbol: 'USDC',
                      size: 105,
                      cost_usd: 105,
                    },
                  ],
                },
              ],
              error: null,
            })),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    supabaseMock.rpc.mockResolvedValue({
      data: [
        {
          trader_state_id: 'ts-1',
          total_count: 3,
          completed_count: 2,
          failed_count: 1,
          avg_latency_ms: 1250,
          total_realized_pnl: 12.5,
          profitable_count: 1,
          loss_count: 1,
          profit_factor: 1.5,
        },
      ],
      error: null,
    });

    const { GET } = await import('@/app/api/demo-vault/route');
    const response = await GET(new Request('http://localhost/api/demo-vault?wallet=wallet-1') as any);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(supabaseMock.rpc).toHaveBeenCalledTimes(1);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_demo_trade_stats', {
      p_trader_state_ids: ['ts-1'],
    });
    expect(json.traderStates[0].tradeStats).toEqual({
      totalCount: 3,
      completedCount: 2,
      failedCount: 1,
      avgLatency: 1250,
      totalRealizedPnl: 12.5,
      profitableCount: 1,
      lossCount: 1,
      profitFactor: 1.5,
    });
  });

  it('demo-vault trades route can skip summary RPC on subsequent page fetches', async () => {
    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'demo_vaults') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'vault-1' },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'demo_trades') {
        const chain: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          range: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: (value: unknown) => unknown) => resolve({
            data: [
              {
                id: 'trade-1',
                type: 'buy',
                token_in_mint: 'mint-in',
                token_in_symbol: 'USDC',
                token_in_amount: 10,
                token_out_mint: 'mint-out',
                token_out_symbol: 'BONK',
                token_out_amount: 1000,
                usd_value: 10,
                realized_pnl: null,
                latency_diff_ms: 500,
                star_trade_signature: 'sig-1',
                created_at: '2026-03-21T00:00:00.000Z',
                status: 'completed',
                error_message: null,
                leader_in_amount: 20,
                leader_out_amount: 2000,
                leader_usd_value: 20,
              },
            ],
            error: null,
          })),
        };

        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('@/app/api/demo-vault/trades/route');
    const response = await GET(
      new Request('http://localhost/api/demo-vault/trades?wallet=wallet-1&traderStateId=ts-1&includeSummary=0') as any
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(supabaseMock.rpc).not.toHaveBeenCalled();
    expect(json.stats).toBeNull();
    expect(json.pagination.totalCount).toBeNull();
    expect(json.trades).toHaveLength(1);
  });
});
