import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

function createThenable<T>(value: T) {
  return {
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(value)),
  };
}

describe('cleanup-trades route', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  it('returns 401 for unauthorized production requests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'top-secret';

    const { GET } = await import('@/app/api/cron/cleanup-trades/route');
    const response = await GET(new Request('http://localhost/api/cron/cleanup-trades'));

    expect(response.status).toBe(401);
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('returns 500 when CRON_SECRET is missing in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CRON_SECRET;

    const { GET } = await import('@/app/api/cron/cleanup-trades/route');
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-trades', {
        headers: { authorization: 'Bearer anything' },
      })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server misconfigured' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('uses only ID-based trade deletion for authorized requests', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'top-secret';

    const tradeDeleteChain = {
      in: vi.fn().mockReturnValue(createThenable({ count: 2, error: null })),
      lte: vi.fn(),
      neq: vi.fn(),
      lt: vi.fn(),
    };

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'star_traders') {
        return {
          select: vi.fn().mockReturnValue(createThenable({ data: [{ address: 'wallet-1' }], error: null })),
        };
      }

      if (table === 'trades') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                range: vi.fn().mockReturnValue(createThenable({ data: [{ id: 'trade-1' }, { id: 'trade-2' }], error: null })),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue(tradeDeleteChain),
        };
      }

      if (table === 'token_prices') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              range: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { updated_at: '2026-01-01T00:00:00.000Z' }, error: null }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            lt: vi.fn().mockReturnValue(createThenable({ count: 3, error: null })),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const { GET } = await import('@/app/api/cron/cleanup-trades/route');
    const response = await GET(
      new Request('http://localhost/api/cron/cleanup-trades', {
        headers: { authorization: 'Bearer top-secret' },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      totalDeleted: 2,
      tokensDeleted: 3,
      details: [{ wallet: 'wallet-1', deleted: 2 }],
    });
    expect(tradeDeleteChain.in).toHaveBeenCalledWith('id', ['trade-1', 'trade-2']);
    expect(tradeDeleteChain.lte).not.toHaveBeenCalled();
    expect(tradeDeleteChain.neq).not.toHaveBeenCalled();
  });
});
