import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
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

function createPositions(activeCount: number, zeroCount = 0) {
  const active = Array.from({ length: activeCount }, (_, index) => ({
    token_mint: `mint-${String(index + 1).padStart(3, '0')}`,
    token_symbol: `T${index + 1}`,
    size: 1,
    cost_usd: 1,
    avg_cost: 1,
  }));

  const zero = Array.from({ length: zeroCount }, (_, index) => ({
    token_mint: `zero-${String(index + 1).padStart(3, '0')}`,
    token_symbol: `Z${index + 1}`,
    size: 0,
    cost_usd: 0,
    avg_cost: 0,
  }));

  return [...active, ...zero];
}

function mockJupiterPartialResponses() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const ids = new URL(url).searchParams.get('ids')?.split(',').filter(Boolean) || [];
    const payload = Object.fromEntries(
      ids.slice(0, 50).map((mint) => [mint, { usdPrice: 1 }])
    );

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('demo vault valuation routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    getSessionMock.mockResolvedValue({
      isLoggedIn: true,
      user: { wallet: 'wallet-1' },
    });

    getTokensMetadataMock.mockResolvedValue({});
  });

  it('demo-vault overview values trader states from active positions only and survives Jupiter partial responses', async () => {
    const positions = createPositions(60, 40);
    const fetchMock = mockJupiterPartialResponses();

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
            eq: vi.fn().mockReturnValue(
              createThenable({
                data: [
                  {
                    id: 'ts-1',
                    star_trader: 'star-1',
                    allocated_usd: 100,
                    realized_pnl_usd: 0,
                    is_syncing: false,
                    is_initialized: true,
                    is_paused: false,
                    is_settled: false,
                    positions,
                  },
                ],
                error: null,
              })
            ),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    supabaseMock.rpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const { GET } = await import('@/app/api/demo-vault/route');
    const response = await GET(new Request('http://localhost/api/demo-vault?wallet=wallet-1') as any);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.traderStates[0].positionCount).toBe(60);
    expect(json.traderStates[0].positions).toHaveLength(60);
    expect(json.traderStates[0].totalValue).toBe(60);
  });

  it('demo-vault portfolio chunks Jupiter price calls so portfolio value stays complete beyond 50 mints', async () => {
    const positions = createPositions(60, 5);
    const fetchMock = mockJupiterPartialResponses();

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
                    allocated_usd: 60,
                    realized_pnl_usd: 0,
                    is_initialized: true,
                    is_paused: false,
                    is_settled: false,
                    demo_vaults: { user_wallet: 'wallet-1' },
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
            eq: vi.fn().mockReturnValue(
              createThenable({
                data: positions,
                error: null,
              })
            ),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('@/app/api/demo-vault/portfolio/route');
    const response = await GET(
      new Request(
        'http://localhost/api/demo-vault/portfolio?wallet=wallet-1&traderStateId=ts-1'
      ) as any
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(json.positions).toHaveLength(60);
    expect(json.portfolioValue).toBe(60);
    expect(json.totalCostBasis).toBe(60);
    expect(json.totalPnL).toBe(0);
    expect(json.invariantValid).toBe(true);
    expect(json.hasStalePrices).toBe(false);
  });
});
