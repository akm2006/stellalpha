import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

describe('star traders route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock.rpc.mockReset();
  });

  it('loads leaderboard stats through one RPC and keeps anonymous responses cacheable', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'star_traders') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  address: 'wallet-1',
                  name: 'Trader One',
                  image_url: null,
                  created_at: '2026-03-21T00:00:00.000Z',
                },
                {
                  address: 'wallet-2',
                  name: 'Trader Two',
                  image_url: 'https://example.com/two.png',
                  created_at: '2026-03-20T00:00:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    supabaseMock.rpc.mockResolvedValue({
      data: [
        {
          wallet: 'wallet-1',
          total_pnl: 220,
          pnl_7d: 120,
          pnl_7d_percent: 12,
          win_rate: 60,
          wins: 6,
          losses: 4,
          trades_count: 20,
          follower_count: 3,
          total_allocated: 900,
          total_volume: 2000,
          profit_factor: 3,
          last_trade_time: 1711000000000,
        },
        {
          wallet: 'wallet-2',
          total_pnl: 30,
          pnl_7d: 15,
          pnl_7d_percent: 2,
          win_rate: 50,
          wins: 2,
          losses: 2,
          trades_count: 4,
          follower_count: 1,
          total_allocated: 250,
          total_volume: 500,
          profit_factor: 1.2,
          last_trade_time: 1710900000000,
        },
      ],
      error: null,
    });

    const { GET } = await import('@/app/api/star-traders/route');
    const response = await GET(new NextRequest('http://localhost/api/star-traders'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, s-maxage=30, stale-while-revalidate=120');
    expect(supabaseMock.rpc).toHaveBeenCalledWith('get_star_trader_stats', {
      p_wallets: ['wallet-1', 'wallet-2'],
    });
    expect(json.traders).toHaveLength(2);
    expect(json.traders[0].wallet).toBe('wallet-1');
    expect(json.traders[1].wallet).toBe('wallet-2');
    expect(json.traders[0].stats.totalPnl).toBe(220);
  });

  it('returns private responses when follow-state is requested', async () => {
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'star_traders') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  address: 'wallet-1',
                  name: 'Trader One',
                  image_url: null,
                  created_at: '2026-03-21T00:00:00.000Z',
                },
              ],
              error: null,
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
              data: [{ star_trader: 'wallet-1' }],
              error: null,
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    supabaseMock.rpc.mockResolvedValue({
      data: [
        {
          wallet: 'wallet-1',
          total_pnl: 10,
          pnl_7d: 10,
          pnl_7d_percent: 4,
          win_rate: 100,
          wins: 1,
          losses: 0,
          trades_count: 2,
          follower_count: 1,
          total_allocated: 100,
          total_volume: 200,
          profit_factor: 2,
          last_trade_time: 1711000000000,
        },
      ],
      error: null,
    });

    const { GET } = await import('@/app/api/star-traders/route');
    const response = await GET(new NextRequest('http://localhost/api/star-traders?userWallet=user-wallet'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(json.traders[0].isFollowing).toBe(true);
  });
});
