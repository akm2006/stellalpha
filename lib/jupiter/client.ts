export type JupiterApiScope = 'live' | 'demo' | 'price' | 'token';

const DEFAULT_MIN_INTERVAL_MS: Record<JupiterApiScope, number> = {
  live: 350,
  demo: 250,
  price: 250,
  token: 300,
};

const DEFAULT_429_RETRIES: Record<JupiterApiScope, number> = {
  live: 1,
  demo: 2,
  price: 2,
  token: 2,
};

const nextAllowedAtByScope = new Map<JupiterApiScope, number>();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0
    || normalized.startsWith('replace_')
    || normalized.includes('placeholder')
    || normalized.includes('your_')
    || normalized === 'changeme'
    || normalized === 'todo'
  );
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && !isPlaceholder(value) ? value : null;
}

export function getJupiterApiKey(scope: JupiterApiScope) {
  if (scope === 'live') {
    return readEnv('JUPITER_LIVE_API_KEY') || readEnv('JUPITER_API_KEY');
  }

  return readEnv('JUPITER_API_KEY');
}

function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getMinIntervalMs(scope: JupiterApiScope) {
  const envName = `JUPITER_${scope.toUpperCase()}_MIN_INTERVAL_MS`;
  return readNumberEnv(envName, DEFAULT_MIN_INTERVAL_MS[scope]);
}

function getMax429Retries(scope: JupiterApiScope, override?: number) {
  if (typeof override === 'number') {
    return Math.max(0, override);
  }

  const envName = `JUPITER_${scope.toUpperCase()}_429_RETRIES`;
  return readNumberEnv(envName, DEFAULT_429_RETRIES[scope]);
}

function parseRetryAfterMs(response: Response) {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return null;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(retryAfter);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

async function throttle(scope: JupiterApiScope) {
  const minIntervalMs = getMinIntervalMs(scope);
  if (minIntervalMs <= 0) return;

  const now = Date.now();
  const nextAllowedAt = nextAllowedAtByScope.get(scope) || 0;
  const waitMs = Math.max(0, nextAllowedAt - now);
  nextAllowedAtByScope.set(scope, Math.max(now, nextAllowedAt) + minIntervalMs);

  if (waitMs > 0) {
    await wait(waitMs);
  }
}

export function buildJupiterHeaders(scope: JupiterApiScope, headers?: HeadersInit) {
  const resolved = new Headers(headers);
  const apiKey = getJupiterApiKey(scope);
  if (apiKey && !resolved.has('x-api-key')) {
    resolved.set('x-api-key', apiKey);
  }
  return resolved;
}

export async function jupiterFetch(
  input: string | URL,
  init: RequestInit = {},
  options: {
    scope: JupiterApiScope;
    operation?: string;
    max429Retries?: number;
    timeoutMs?: number;
  },
) {
  const max429Retries = getMax429Retries(options.scope, options.max429Retries);
  let attempt = 0;

  while (true) {
    await throttle(options.scope);
    const controller = options.timeoutMs && options.timeoutMs > 0
      ? new AbortController()
      : null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let removeAbortListener: (() => void) | null = null;

    if (controller) {
      timeoutHandle = setTimeout(() => {
        controller.abort(
          new Error(
            `Jupiter ${options.operation || options.scope} timed out after ${options.timeoutMs}ms`,
          ),
        );
      }, options.timeoutMs);

      if (init.signal) {
        const forwardAbort = () => controller.abort(init.signal!.reason);
        if (init.signal.aborted) {
          forwardAbort();
        } else {
          init.signal.addEventListener('abort', forwardAbort, { once: true });
          removeAbortListener = () => init.signal?.removeEventListener('abort', forwardAbort);
        }
      }
    }

    let response: Response;
    try {
      response = await fetch(input, {
        ...init,
        headers: buildJupiterHeaders(options.scope, init.headers),
        signal: controller?.signal || init.signal,
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      removeAbortListener?.();
    }

    if (response.status !== 429 || attempt >= max429Retries) {
      return response;
    }

    attempt += 1;
    const retryAfterMs = parseRetryAfterMs(response);
    const backoffMs = retryAfterMs ?? Math.min(5000, 500 * Math.pow(2, attempt - 1));
    const jitterMs = Math.floor(Math.random() * 150);
    console.warn(
      `[JUPITER:${options.scope}] 429${options.operation ? ` during ${options.operation}` : ''}; `
      + `backing off for ${backoffMs + jitterMs}ms`,
    );
    await wait(backoffMs + jitterMs);
  }
}
