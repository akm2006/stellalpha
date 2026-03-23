import { supabase } from '@/lib/supabase';
import { serializeYellowstoneRaw } from '@/lib/ingestion/yellowstone-raw-serializer';
import type {
  YellowstoneRawBlockMetaCapture,
  YellowstoneRawTransactionCapture,
} from '@/lib/ingestion/yellowstone-stream';

const YELLOWSTONE_RAW_TRANSACTIONS_TABLE = 'yellowstone_raw_transactions';
const YELLOWSTONE_RAW_BLOCKS_META_TABLE = 'yellowstone_raw_blocks_meta';

export async function upsertYellowstoneRawTransactions(captures: YellowstoneRawTransactionCapture[]) {
  if (captures.length === 0) {
    return;
  }

  const { error } = await supabase
    .from(YELLOWSTONE_RAW_TRANSACTIONS_TABLE)
    .upsert(
      captures.map((capture) => ({
        signature: capture.signature,
        wallet: capture.wallet,
        slot: capture.slot,
        receive_commitment: capture.receiveCommitment,
        source_received_at: capture.sourceReceivedAt,
        yellowstone_created_at: capture.yellowstoneCreatedAt,
        transaction_update: serializeYellowstoneRaw(capture.transactionUpdate),
      })),
      { onConflict: 'signature' }
    );

  if (error) {
    throw new Error(`Failed to persist Yellowstone raw transactions: ${error.message}`);
  }
}

export async function upsertYellowstoneRawBlocksMeta(captures: YellowstoneRawBlockMetaCapture[]) {
  if (captures.length === 0) {
    return;
  }

  const { error } = await supabase
    .from(YELLOWSTONE_RAW_BLOCKS_META_TABLE)
    .upsert(
      captures.map((capture) => ({
        slot: capture.slot,
        block_time: capture.blockTime,
        block_meta_update: serializeYellowstoneRaw(capture.blockMetaUpdate),
      })),
      { onConflict: 'slot' }
    );

  if (error) {
    throw new Error(`Failed to persist Yellowstone raw blocksMeta: ${error.message}`);
  }
}
