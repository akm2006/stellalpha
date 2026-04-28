import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildJupiterHeaders,
  getJupiterApiKey,
  jupiterFetch,
} from '@/lib/jupiter/client';

const ENV_KEYS = [
  'JUPITER_API_KEY',
  'JUPITER_LIVE_API_KEY',
  'JUPITER_LIVE_MIN_INTERVAL_MS',
  'JUPITER_DEMO_MIN_INTERVAL_MS',
  'JUPITER_PRICE_MIN_INTERVAL_MS',
  'JUPITER_TOKEN_MIN_INTERVAL_MS',
  'JUPITER_DEMO_429_RETRIES',
] as const;

const originalEnv = new Map<string, string | undefined>();

for (const key of ENV_KEYS) {
  originalEnv.set(key, process.env[key]);
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const original = originalEnv.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

describe('jupiter client', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.JUPITER_LIVE_MIN_INTERVAL_MS = '0';
    process.env.JUPITER_DEMO_MIN_INTERVAL_MS = '0';
    process.env.JUPITER_PRICE_MIN_INTERVAL_MS = '0';
    process.env.JUPITER_TOKEN_MIN_INTERVAL_MS = '0';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv();
  });

  it('uses a live-specific key for execution and ignores local placeholders', () => {
    process.env.JUPITER_API_KEY = 'fallback-key';
    process.env.JUPITER_LIVE_API_KEY = 'replace_with_live_execution_jupiter_api_key';

    expect(getJupiterApiKey('live')).toBe('fallback-key');

    process.env.JUPITER_LIVE_API_KEY = 'live-key';

    expect(getJupiterApiKey('live')).toBe('live-key');
    expect(getJupiterApiKey('demo')).toBe('fallback-key');
    expect(getJupiterApiKey('price')).toBe('fallback-key');
    expect(getJupiterApiKey('token')).toBe('fallback-key');
  });

  it('adds the scoped api key without overwriting explicit headers', () => {
    process.env.JUPITER_API_KEY = 'demo-key';

    const headers = buildJupiterHeaders('price', {
      'Content-Type': 'application/json',
    });

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-api-key')).toBe('demo-key');

    const explicit = buildJupiterHeaders('price', {
      'x-api-key': 'explicit-key',
    });

    expect(explicit.get('x-api-key')).toBe('explicit-key');
  });

  it('backs off and retries a bounded 429 response', async () => {
    process.env.JUPITER_API_KEY = 'demo-key';
    process.env.JUPITER_DEMO_429_RETRIES = '1';
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', {
        status: 429,
        headers: { 'retry-after': '0' },
      }))
      .mockResolvedValueOnce(new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const response = await jupiterFetch('https://api.jup.ag/test', {}, {
      scope: 'demo',
      operation: 'test',
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(firstInit.headers).get('x-api-key')).toBe('demo-key');
  });
});
