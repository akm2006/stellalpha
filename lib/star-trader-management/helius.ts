const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HELIUS_STAR_TRADERS_WEBHOOK_ID =
  process.env.HELIUS_STAR_TRADERS_WEBHOOK_ID ||
  process.env.HELIUS_STAR_TRADER_WEBHOOK_ID;

const HELIUS_WEBHOOK_BASE = 'https://api-mainnet.helius-rpc.com/v0/webhooks';

export interface HeliusWebhook {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
  authHeader?: string;
  active: boolean;
}

function getWebhookUrl(path = '') {
  if (!HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY is not configured');
  }
  return `${HELIUS_WEBHOOK_BASE}${path}?api-key=${encodeURIComponent(HELIUS_API_KEY)}`;
}

export function isHeliusStarTraderWebhookConfigured() {
  return Boolean(HELIUS_API_KEY && HELIUS_STAR_TRADERS_WEBHOOK_ID);
}

export async function getHeliusStarTraderWebhook(): Promise<HeliusWebhook> {
  if (!HELIUS_STAR_TRADERS_WEBHOOK_ID) {
    throw new Error('HELIUS_STAR_TRADERS_WEBHOOK_ID is not configured');
  }

  const response = await fetch(getWebhookUrl(`/${HELIUS_STAR_TRADERS_WEBHOOK_ID}`), {
    method: 'GET',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Failed to fetch Helius webhook configuration');
  }

  return payload as HeliusWebhook;
}

export async function updateHeliusStarTraderWebhookAddresses(
  accountAddresses: string[],
): Promise<HeliusWebhook> {
  const existingWebhook = await getHeliusStarTraderWebhook();
  const uniqueAddresses = Array.from(new Set(accountAddresses)).sort((a, b) => a.localeCompare(b));

  const response = await fetch(getWebhookUrl(`/${existingWebhook.webhookID}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      webhookURL: existingWebhook.webhookURL,
      transactionTypes: existingWebhook.transactionTypes,
      accountAddresses: uniqueAddresses,
      webhookType: existingWebhook.webhookType,
      authHeader: existingWebhook.authHeader,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'Failed to update Helius webhook');
  }

  return payload as HeliusWebhook;
}
