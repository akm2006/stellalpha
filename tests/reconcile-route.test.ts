import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

const processBatchMock = vi.hoisted(() => vi.fn());
const normalizeWebsocketPayloadMock = vi.hoisted(() => vi.fn());
const detectTradeMock = vi.hoisted(() => vi.fn());
const getSolPriceMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: supabaseMock,
}));

vi.mock('@/lib/ingestion/orchestrator', () => ({
  processBatch: processBatchMock,
}));

vi.mock('@/lib/ingestion/websocket-adapter', () => ({
  normalizeWebsocketPayload: normalizeWebsocketPayloadMock,
}));

vi.mock('@/lib/trade-parser', () => ({
  detectTrade: detectTradeMock,
}));

vi.mock('@/lib/services/token-service', () => ({
  getSolPrice: getSolPriceMock,
}));

function createThenable<T>(value: T) {
  return {
    then: (resolve: (value: T) => unknown) => Promise.resolve(resolve(value)),
  };
}

describe('reconcile route', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalHeliusApiKey = process.env.HELIUS_API_KEY;
  const originalHeliusRpcUrl = process.env.HELIUS_API_RPC_URL;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);

    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'top-secret';
    process.env.HELIUS_API_KEY = 'helius-key';
    process.env.HELIUS_API_RPC_URL = 'https://rpc.example.com';

    getSolPriceMock.mockResolvedValue(150);
    processBatchMock.mockResolvedValue({ processed: 1, inserted: 1 });
    normalizeWebsocketPayloadMock.mockImplementation((txs: any[]) =>
      txs.map((tx) => ({
        signature: tx.signature,
        timestamp: tx.timestamp ?? 1,
        feePayer: tx.feePayer ?? '',
        source: 'websocket',
        raw: tx,
      }))
    );

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'star_traders') {
        return {
          select: vi.fn().mockReturnValue(createThenable({ data: [{ address: 'wallet-1' }], error: null })),
        };
      }

      if (table === 'trades') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue(createThenable({ data: [], error: null })),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NODE_ENV = originalNodeEnv;

    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }

    if (originalHeliusApiKey === undefined) {
      delete process.env.HELIUS_API_KEY;
    } else {
      process.env.HELIUS_API_KEY = originalHeliusApiKey;
    }

    if (originalHeliusRpcUrl === undefined) {
      delete process.env.HELIUS_API_RPC_URL;
    } else {
      process.env.HELIUS_API_RPC_URL = originalHeliusRpcUrl;
    }
  });

  it('processes only trade candidates and caches non-trade signatures', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [
            { signature: 'sig-trade', err: null },
            { signature: 'sig-nontrade', err: null },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { signature: 'sig-trade', timestamp: 1, feePayer: 'wallet-1' },
          { signature: 'sig-nontrade', timestamp: 1, feePayer: 'wallet-1' },
        ]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: [
            { signature: 'sig-trade', err: null },
            { signature: 'sig-nontrade', err: null },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { signature: 'sig-trade', timestamp: 1, feePayer: 'wallet-1' },
        ]),
      });

    detectTradeMock.mockImplementation((tx: any) =>
      tx.signature === 'sig-trade' ? { signature: tx.signature } : null
    );

    const { GET } = await import('@/app/api/cron/reconcile/route');
    const request = new Request('http://localhost/api/cron/reconcile', {
      headers: { authorization: 'Bearer top-secret' },
    });

    const firstResponse = await GET(request);
    const firstJson = await firstResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(firstJson.missingFound).toBe(1);
    expect(firstJson.processed).toBe(1);
    expect(firstJson.inserted).toBe(1);
    expect(normalizeWebsocketPayloadMock).toHaveBeenCalledWith([
      { signature: 'sig-trade', timestamp: 1, feePayer: 'wallet-1' },
    ]);
    expect(processBatchMock).toHaveBeenCalledTimes(1);

    const secondResponse = await GET(request);
    const secondJson = await secondResponse.json();

    expect(secondResponse.status).toBe(200);
    expect(secondJson.missingFound).toBe(1);
    expect(processBatchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
