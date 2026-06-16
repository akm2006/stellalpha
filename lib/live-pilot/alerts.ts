const PILOT_TELEGRAM_BOT_TOKEN = process.env.PILOT_TELEGRAM_BOT_TOKEN?.trim() || '';
const PILOT_TELEGRAM_CHAT_ID = process.env.PILOT_TELEGRAM_CHAT_ID?.trim() || '';

export type LivePilotAlertSeverity = 'debug' | 'info' | 'digest' | 'action' | 'critical';

export interface LivePilotAlertOptions {
  severity?: LivePilotAlertSeverity;
  dedupeKey?: string;
  dedupeTtlMs?: number;
  force?: boolean;
}

const SEVERITY_RANK: Record<LivePilotAlertSeverity, number> = {
  debug: 0,
  info: 1,
  digest: 2,
  action: 3,
  critical: 4,
};

const DEFAULT_ALERT_LEVEL: LivePilotAlertSeverity = 'action';
const DEFAULT_DEDUPE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MIN_INTERVAL_MS = 1_100;
const COOLDOWN_LOG_INTERVAL_MS = 60 * 1000;

let nextTelegramSendAt = 0;
let telegramCooldownUntil = 0;
let lastCooldownLogAt = 0;
let suppressedDuringCooldown = 0;
const dedupeUntilByKey = new Map<string, number>();

function intEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readAlertLevel(): LivePilotAlertSeverity {
  const raw = (process.env.LIVE_PILOT_TELEGRAM_ALERT_LEVEL || DEFAULT_ALERT_LEVEL)
    .trim()
    .toLowerCase();
  if (raw in SEVERITY_RANK) {
    return raw as LivePilotAlertSeverity;
  }
  return DEFAULT_ALERT_LEVEL;
}

function hasTelegramConfig() {
  return Boolean(PILOT_TELEGRAM_BOT_TOKEN && PILOT_TELEGRAM_CHAT_ID);
}

export function isLivePilotAlertsConfigured() {
  return hasTelegramConfig();
}

function pruneDedupe(now: number) {
  for (const [key, expiresAt] of dedupeUntilByKey) {
    if (expiresAt <= now) {
      dedupeUntilByKey.delete(key);
    }
  }
}

function parseTelegramRetryAfterSeconds(payloadText: string) {
  try {
    const payload = JSON.parse(payloadText) as {
      parameters?: {
        retry_after?: unknown;
      };
    };
    const retryAfter = Number(payload?.parameters?.retry_after);
    return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
  } catch {
    return null;
  }
}

function shouldDeliverToTelegram(
  title: string,
  lines: string[],
  options: Required<Pick<LivePilotAlertOptions, 'severity'>>,
  fullOptions: LivePilotAlertOptions,
) {
  const now = Date.now();
  const configuredLevel = readAlertLevel();
  if (!fullOptions.force && SEVERITY_RANK[options.severity] < SEVERITY_RANK[configuredLevel]) {
    return { deliver: false, reason: 'below_alert_level' };
  }

  if (!fullOptions.force && telegramCooldownUntil > now) {
    suppressedDuringCooldown += 1;
    if (now - lastCooldownLogAt >= COOLDOWN_LOG_INTERVAL_MS) {
      lastCooldownLogAt = now;
      console.warn(
        `[LIVE_PILOT][ALERT_SUPPRESSED] Telegram flood-control cooldown active for `
        + `${Math.ceil((telegramCooldownUntil - now) / 1000)}s; suppressed=${suppressedDuringCooldown}`,
      );
    }
    return { deliver: false, reason: 'telegram_cooldown' };
  }

  if (
    !fullOptions.force
    && options.severity !== 'critical'
    && nextTelegramSendAt > now
  ) {
    return { deliver: false, reason: 'telegram_min_interval' };
  }

  const dedupeKey = fullOptions.dedupeKey || `${title}\n${lines.join('\n')}`;
  const dedupeTtlMs = fullOptions.dedupeTtlMs ?? DEFAULT_DEDUPE_TTL_MS;
  if (!fullOptions.force && dedupeTtlMs > 0) {
    pruneDedupe(now);
    const dedupeUntil = dedupeUntilByKey.get(dedupeKey) || 0;
    if (dedupeUntil > now) {
      return { deliver: false, reason: 'deduped' };
    }
    dedupeUntilByKey.set(dedupeKey, now + dedupeTtlMs);
  }

  return { deliver: true, reason: 'deliver' };
}

export async function sendLivePilotAlert(
  title: string,
  lines: string[],
  options: LivePilotAlertOptions = {},
) {
  const severity = options.severity || 'action';
  const message = ['[LIVE_PILOT]', `[${severity.toUpperCase()}] ${title}`, ...lines].join('\n');

  if (!hasTelegramConfig()) {
    if (severity === 'critical' || severity === 'action') {
      console.warn(`[LIVE_PILOT][ALERT_SKIPPED] ${message}`);
    }
    return false;
  }

  const decision = shouldDeliverToTelegram(title, lines, { severity }, options);
  if (!decision.deliver) {
    if (severity === 'critical' && decision.reason !== 'telegram_cooldown') {
      console.warn(`[LIVE_PILOT][ALERT_SUPPRESSED] reason=${decision.reason} ${message}`);
    }
    return false;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${PILOT_TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: PILOT_TELEGRAM_CHAT_ID,
        text: message,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 429) {
        const retryAfterSeconds = parseTelegramRetryAfterSeconds(text);
        if (retryAfterSeconds) {
          telegramCooldownUntil = Date.now() + retryAfterSeconds * 1000;
        }
      }
      console.warn(`[LIVE_PILOT][ALERT_FAILED] ${response.status} ${text}`);
      return false;
    }

    const now = Date.now();
    nextTelegramSendAt = now + intEnv('LIVE_PILOT_TELEGRAM_MIN_INTERVAL_MS', DEFAULT_MIN_INTERVAL_MS);
    if (suppressedDuringCooldown > 0) {
      console.warn(`[LIVE_PILOT][ALERT_RECOVERED] Telegram delivery resumed; suppressed=${suppressedDuringCooldown}`);
      suppressedDuringCooldown = 0;
    }
    return true;
  } catch (error) {
    console.warn('[LIVE_PILOT][ALERT_FAILED]', error);
    return false;
  }
}

export function formatSolscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}
