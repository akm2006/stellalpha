const PILOT_TELEGRAM_BOT_TOKEN = process.env.PILOT_TELEGRAM_BOT_TOKEN?.trim() || '';
const PILOT_TELEGRAM_CHAT_ID = process.env.PILOT_TELEGRAM_CHAT_ID?.trim() || '';

function hasTelegramConfig() {
  return Boolean(PILOT_TELEGRAM_BOT_TOKEN && PILOT_TELEGRAM_CHAT_ID);
}

export function isLivePilotAlertsConfigured() {
  return hasTelegramConfig();
}

export async function sendLivePilotAlert(title: string, lines: string[]) {
  const message = ['[LIVE_PILOT]', title, ...lines].join('\n');

  if (!hasTelegramConfig()) {
    console.warn(`[LIVE_PILOT][ALERT_SKIPPED] ${message}`);
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
      console.warn(`[LIVE_PILOT][ALERT_FAILED] ${response.status} ${text}`);
      return false;
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
