import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const processBatchMock = vi.hoisted(() => vi.fn());
const normalizeWebhookPayloadMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ingestion/orchestrator', () => ({
  processBatch: processBatchMock,
}));

vi.mock('@/lib/ingestion/webhook-adapter', () => ({
  normalizeWebhookPayload: normalizeWebhookPayloadMock,
}));

describe('helius webhook route', () => {
  const originalSecret = process.env.HELIUS_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.HELIUS_WEBHOOK_SECRET = 'webhook-secret';
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.HELIUS_WEBHOOK_SECRET;
    } else {
      process.env.HELIUS_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('returns 400 for malformed JSON bodies', async () => {
    const { POST } = await import('@/app/api/helius-webhook/route');
    const response = await POST(new Request('http://localhost/api/helius-webhook', {
      method: 'POST',
      headers: {
        authorization: 'webhook-secret',
        'content-type': 'application/json',
      },
      body: '{',
    }) as any);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Malformed JSON body' });
  });

  it('returns 500 when processing fails', async () => {
    normalizeWebhookPayloadMock.mockReturnValue([{ signature: 'sig-1' }]);
    processBatchMock.mockRejectedValue(new Error('boom'));

    const { POST } = await import('@/app/api/helius-webhook/route');
    const response = await POST(new Request('http://localhost/api/helius-webhook', {
      method: 'POST',
      headers: {
        authorization: 'webhook-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ signature: 'sig-1', timestamp: Math.floor(Date.now() / 1000) }),
    }) as any);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Processing failed' });
  });

  it('returns 200 when normalization and processing succeed', async () => {
    normalizeWebhookPayloadMock.mockReturnValue([{ signature: 'sig-1' }]);
    processBatchMock.mockResolvedValue({ processed: 1, inserted: 1 });

    const { POST } = await import('@/app/api/helius-webhook/route');
    const response = await POST(new Request('http://localhost/api/helius-webhook', {
      method: 'POST',
      headers: {
        authorization: 'webhook-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ signature: 'sig-1', timestamp: Math.floor(Date.now() / 1000) }),
    }) as any);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      processed: 1,
      inserted: 1,
    });
  });
});
