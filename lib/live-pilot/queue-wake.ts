import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const LIVE_PILOT_QUEUE_CHANNEL = 'live-pilot-queue';
const LIVE_PILOT_QUEUE_EVENT = 'queue-wake';
const SUBSCRIBE_TIMEOUT_MS = 5_000;

let broadcastSenderPromise: Promise<RealtimeChannel> | null = null;

function waitForSubscription(channel: RealtimeChannel) {
  return new Promise<RealtimeChannel>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out subscribing to live-pilot broadcast channel'));
    }, SUBSCRIBE_TIMEOUT_MS);

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        resolve(channel);
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        clearTimeout(timeout);
        reject(new Error(`Live-pilot broadcast channel failed with status ${status}`));
      }
    });
  });
}

async function getBroadcastSenderChannel() {
  if (!broadcastSenderPromise) {
    const channel = supabase.channel(LIVE_PILOT_QUEUE_CHANNEL, {
      config: {
        broadcast: {
          ack: false,
          self: false,
        },
      },
    });

    broadcastSenderPromise = waitForSubscription(channel).catch((error) => {
      broadcastSenderPromise = null;
      throw error;
    });
  }

  return broadcastSenderPromise;
}

export async function broadcastLivePilotQueueWake(payload: {
  source: string;
  walletAlias?: string;
  tradeId?: string;
}) {
  try {
    const channel = await getBroadcastSenderChannel();
    await channel.send({
      type: 'broadcast',
      event: LIVE_PILOT_QUEUE_EVENT,
      payload: {
        ...payload,
        emittedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.warn('[LIVE_PILOT] Failed to broadcast queue wake:', error);
  }
}

export async function subscribeToLivePilotQueueWake(onWake: (payload: Record<string, unknown>) => void) {
  const channel = supabase.channel(LIVE_PILOT_QUEUE_CHANNEL, {
    config: {
      broadcast: {
        ack: false,
        self: false,
      },
    },
  });

  channel.on('broadcast', { event: LIVE_PILOT_QUEUE_EVENT }, ({ payload }) => {
    onWake((payload || {}) as Record<string, unknown>);
  });

  await waitForSubscription(channel);
  return channel;
}

export async function unsubscribeFromLivePilotQueueWake(channel: RealtimeChannel | null | undefined) {
  if (!channel) {
    return;
  }

  await supabase.removeChannel(channel).catch(() => undefined);
}
