import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

async function loadAlerts() {
  vi.resetModules();
  return import('@/lib/live-pilot/alerts');
}

describe('live-pilot alerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-16T00:00:00.000Z'));
    process.env = {
      ...originalEnv,
      PILOT_TELEGRAM_BOT_TOKEN: 'bot-token',
      PILOT_TELEGRAM_CHAT_ID: 'chat-id',
      LIVE_PILOT_TELEGRAM_ALERT_LEVEL: 'action',
    };
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('suppresses routine info messages below the configured Telegram alert level', async () => {
    const { sendLivePilotAlert } = await loadAlerts();
    const delivered = await sendLivePilotAlert('Trade submitted', ['tx=abc'], {
      severity: 'info',
    });

    expect(delivered).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('honors Telegram retry_after cooldown after flood-control responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        error_code: 429,
        parameters: { retry_after: 10 },
      }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { sendLivePilotAlert } = await loadAlerts();
    const first = await sendLivePilotAlert('Kill switch activated', ['wallet=PilotB'], {
      severity: 'critical',
      dedupeKey: 'kill',
    });
    const suppressed = await sendLivePilotAlert('Wallet liquidation requested', ['wallet=PilotB'], {
      severity: 'critical',
      dedupeKey: 'liquidate',
    });

    vi.advanceTimersByTime(10_001);

    const delivered = await sendLivePilotAlert('Wallet liquidation requested', ['wallet=PilotB'], {
      severity: 'critical',
      dedupeKey: 'liquidate',
    });

    expect(first).toBe(false);
    expect(suppressed).toBe(false);
    expect(delivered).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
