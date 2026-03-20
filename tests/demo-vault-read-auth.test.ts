import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

const getSessionMock = vi.hoisted(() => vi.fn());
const getTokensMetadataMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/lib/session', () => ({
  getSession: getSessionMock,
}));

vi.mock('@/lib/jupiter-tokens', () => ({
  getTokensMetadata: getTokensMetadataMock,
}));

function createThenable<T>(value: T) {
  return {
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(value)),
  };
}

describe('demo-vault read routes auth', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getTokensMetadataMock.mockResolvedValue({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('portfolio route returns 401 for unauthenticated requests', async () => {
    getSessionMock.mockResolvedValue({ isLoggedIn: false });

    const { GET } = await import('@/app/api/demo-vault/portfolio/route');
    const response = await GET(new Request('http://localhost/api/demo-vault/portfolio?traderStateId=ts-1') as any);

    expect(response.status).toBe(401);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('portfolio route returns 403 for mismatched wallet query params', async () => {
    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    const { GET } = await import('@/app/api/demo-vault/portfolio/route');
    const response = await GET(
      new Request('http://localhost/api/demo-vault/portfolio?wallet=wallet-2&traderStateId=ts-1') as any
    );

    expect(response.status).toBe(403);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('portfolio route still returns data for the authenticated owner', async () => {
    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'demo_trader_states') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'ts-1',
                    star_trader: 'star-1',
                    allocated_usd: 100,
                    realized_pnl_usd: 5,
                    is_initialized: true,
                    is_paused: false,
                    is_settled: false,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'demo_positions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue(createThenable({
              data: [
                {
                  token_mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                  token_symbol: 'USDC',
                  size: 50,
                  cost_usd: 50,
                  avg_cost: 1,
                },
              ],
              error: null,
            })),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('@/app/api/demo-vault/portfolio/route');
    const response = await GET(
      new Request('http://localhost/api/demo-vault/portfolio?wallet=wallet-1&traderStateId=ts-1') as any
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.traderStateId).toBe('ts-1');
    expect(json.starTrader).toBe('star-1');
    expect(json.allocatedUsd).toBe(100);
  });

  it('trades route returns 401 for unauthenticated requests', async () => {
    getSessionMock.mockResolvedValue({ isLoggedIn: false });

    const { GET } = await import('@/app/api/demo-vault/trades/route');
    const response = await GET(new Request('http://localhost/api/demo-vault/trades?traderStateId=ts-1') as any);

    expect(response.status).toBe(401);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('trades route returns 403 for mismatched wallet query params', async () => {
    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    const { GET } = await import('@/app/api/demo-vault/trades/route');
    const response = await GET(
      new Request('http://localhost/api/demo-vault/trades?wallet=wallet-2&traderStateId=ts-1') as any
    );

    expect(response.status).toBe(403);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('trades route still returns data for the authenticated owner', async () => {
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
          then: vi.fn((resolve: (value: unknown) => unknown) => resolve({ data: [], error: null, count: 0 })),
        };
        return chain;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('@/app/api/demo-vault/trades/route');
    const response = await GET(
      new Request('http://localhost/api/demo-vault/trades?wallet=wallet-1&traderStateId=ts-1') as any
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.trades).toEqual([]);
    expect(json.pagination.totalCount).toBe(0);
  });
});
