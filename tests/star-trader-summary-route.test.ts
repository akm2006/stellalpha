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

describe('star trader summary route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock.rpc.mockReset();
  });

  it('returns a single trader summary without requiring the full leaderboard route', async () => {
    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'star_traders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  address: 'star-1',
                  name: 'Alpha Trader',
                  image_url: 'https://example.com/trader.png',
                  created_at: '2026-03-21T00:00:00.000Z',
                },
                error: null,
              }),
            }),
          }),
        };
      }

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

      if (table === 'demo_trader_states') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'ts-1' },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    supabaseMock.rpc.mockResolvedValue({
      data: [
        {
          wallet: 'star-1',
          total_pnl: 15,
          pnl_7d: 15,
          pnl_7d_percent: 10,
          win_rate: 50,
          wins: 1,
          losses: 1,
          trades_count: 2,
          follower_count: 2,
          total_allocated: 400,
          total_volume: 150,
          profit_factor: 4,
          last_trade_time: 1711000000000,
        },
      ],
      error: null,
    });

    const { GET } = await import('@/app/api/star-traders/[wallet]/route');
    const response = await GET(
      new Request('http://localhost/api/star-traders/star-1') as any,
      { params: Promise.resolve({ wallet: 'star-1' }) }
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.trader.wallet).toBe('star-1');
    expect(json.trader.name).toBe('Alpha Trader');
    expect(json.trader.isFollowing).toBe(true);
    expect(json.trader.stats.totalPnl).toBe(15);
    expect(json.trader.stats.followerCount).toBe(2);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_star_trader_stats', {
      p_wallets: ['star-1'],
    });
  });

  it('returns 404 when the trader does not exist', async () => {
    getSessionMock.mockResolvedValue({ isLoggedIn: false });
    supabaseMock.rpc.mockResolvedValue({ data: [], error: null });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'star_traders') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'not found' },
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('@/app/api/star-traders/[wallet]/route');
    const response = await GET(
      new Request('http://localhost/api/star-traders/missing') as any,
      { params: Promise.resolve({ wallet: 'missing' }) }
    );

    expect(response.status).toBe(404);
  });
});
