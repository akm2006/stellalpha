const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 10_000;

function resolveTimeoutMs() {
  const raw = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS || DEFAULT_SUPABASE_FETCH_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SUPABASE_FETCH_TIMEOUT_MS;
}

export function createSupabaseFetch(timeoutMs = resolveTimeoutMs()): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const upstreamSignal = init.signal;
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Supabase request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const abortFromUpstream = () => {
      controller.abort(upstreamSignal?.reason);
    };

    if (upstreamSignal?.aborted) {
      abortFromUpstream();
    } else {
      upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
    }

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
  };
}
