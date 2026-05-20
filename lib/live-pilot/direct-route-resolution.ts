const DEFAULT_DIRECT_ROUTE_RESOLUTION_TIMEOUT_MS = 250;
const DEFAULT_DIRECT_ROUTE_MAX_CANDIDATES = 12;

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const directRouteResolutionConfig = {
  timeoutMs: readPositiveIntEnv(
    'LIVE_PILOT_DIRECT_ROUTE_RESOLUTION_TIMEOUT_MS',
    readPositiveIntEnv('LIVE_PILOT_DIRECT_RESOLUTION_TIMEOUT_MS', DEFAULT_DIRECT_ROUTE_RESOLUTION_TIMEOUT_MS),
  ),
  maxCandidates: readPositiveIntEnv(
    'LIVE_PILOT_DIRECT_ROUTE_MAX_CANDIDATES',
    DEFAULT_DIRECT_ROUTE_MAX_CANDIDATES,
  ),
};

export async function resolveWithinBudget<T>(
  promise: Promise<T>,
  timeoutMs = directRouteResolutionConfig.timeoutMs,
): Promise<T | null> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

export function uniqueBoundedCandidates(candidates: Iterable<string | null | undefined>) {
  return Array.from(new Set(
    Array.from(candidates)
      .map((candidate) => candidate?.trim())
      .filter((candidate): candidate is string => Boolean(candidate)),
  )).slice(0, directRouteResolutionConfig.maxCandidates);
}
