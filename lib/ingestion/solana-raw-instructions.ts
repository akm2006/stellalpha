import bs58 from 'bs58';

function normalizeByteArray(value: unknown): string | null {
  if (value instanceof Uint8Array) {
    return bs58.encode(Buffer.from(value));
  }

  if (Array.isArray(value) && value.length === 32 && value.every((entry) => Number.isInteger(entry))) {
    return bs58.encode(Uint8Array.from(value));
  }

  return null;
}

function normalizeSerializedBuffer(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as {
    __type?: unknown;
    encoding?: unknown;
    data?: unknown;
  };

  if (
    record.__type === 'buffer'
    && record.encoding === 'base64'
    && typeof record.data === 'string'
  ) {
    return bs58.encode(Buffer.from(record.data, 'base64'));
  }

  return normalizeByteArray(record.data);
}

function decodeSerializedBuffer(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry))) {
    return Uint8Array.from(value);
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as {
    __type?: unknown;
    encoding?: unknown;
    data?: unknown;
  };

  if (
    record.__type === 'buffer'
    && record.encoding === 'base64'
    && typeof record.data === 'string'
  ) {
    return Uint8Array.from(Buffer.from(record.data, 'base64'));
  }

  if (Array.isArray(record.data) && record.data.every((entry) => Number.isInteger(entry))) {
    return Uint8Array.from(record.data);
  }

  return null;
}

export function normalizePublicKey(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === 'string') {
    return value;
  }

  const bytes = normalizeByteArray(value);
  if (bytes) return bytes;

  if (typeof (value as { toBase58?: unknown })?.toBase58 === 'function') {
    return (value as { toBase58: () => string }).toBase58();
  }

  if (typeof value === 'object') {
    const serialized = normalizeSerializedBuffer(value);
    if (serialized) return serialized;

    const record = value as {
      pubkey?: unknown;
      publicKey?: unknown;
      address?: unknown;
    };
    return normalizePublicKey(record.pubkey ?? record.publicKey ?? record.address);
  }

  return null;
}

function pushAccountKeys(keys: string[], value: unknown) {
  if (!Array.isArray(value)) return;

  for (const entry of value) {
    const pubkey = normalizePublicKey(entry);
    if (pubkey) {
      keys.push(pubkey);
    }
  }
}

function pushLoadedAddresses(keys: string[], value: unknown) {
  const loaded = value as { writable?: unknown; readonly?: unknown; readable?: unknown } | null | undefined;
  if (!loaded) return;

  pushAccountKeys(keys, loaded.writable);
  pushAccountKeys(keys, loaded.readonly);
  pushAccountKeys(keys, loaded.readable);
}

export function collectSolanaAccountKeys(raw: any): string[] {
  const keys: string[] = [];
  const messages = [
    raw?.transaction?.message,
    raw?.transaction?.transaction?.message,
    raw?.message,
    raw?.raw?.transaction?.message,
    raw?.raw?.transaction?.transaction?.message,
    raw?.parsed?.transaction?.message,
  ];

  for (const message of messages) {
    pushAccountKeys(keys, message?.accountKeys);
    pushAccountKeys(keys, message?.staticAccountKeys);
  }

  pushAccountKeys(keys, raw?.accountKeys);
  pushAccountKeys(keys, raw?.raw?.accountKeys);
  pushLoadedAddresses(keys, raw?.meta?.loadedAddresses);
  pushLoadedAddresses(keys, raw?.transaction?.meta?.loadedAddresses);
  pushAccountKeys(keys, raw?.meta?.loadedWritableAddresses);
  pushAccountKeys(keys, raw?.meta?.loadedReadonlyAddresses);
  pushAccountKeys(keys, raw?.transaction?.meta?.loadedWritableAddresses);
  pushAccountKeys(keys, raw?.transaction?.meta?.loadedReadonlyAddresses);
  pushLoadedAddresses(keys, raw?.raw?.meta?.loadedAddresses);
  pushLoadedAddresses(keys, raw?.raw?.transaction?.meta?.loadedAddresses);
  pushAccountKeys(keys, raw?.raw?.meta?.loadedWritableAddresses);
  pushAccountKeys(keys, raw?.raw?.meta?.loadedReadonlyAddresses);
  pushAccountKeys(keys, raw?.raw?.transaction?.meta?.loadedWritableAddresses);
  pushAccountKeys(keys, raw?.raw?.transaction?.meta?.loadedReadonlyAddresses);

  return keys;
}

function pushInstructions(instructions: any[], value: unknown) {
  if (Array.isArray(value)) {
    instructions.push(...value);
  }
}

function pushInnerInstructions(instructions: any[], value: unknown) {
  if (!Array.isArray(value)) return;

  for (const group of value) {
    pushInstructions(instructions, group?.instructions);
  }
}

export function collectSolanaInstructions(raw: any): any[] {
  const instructions: any[] = [];
  const messages = [
    raw?.transaction?.message,
    raw?.transaction?.transaction?.message,
    raw?.message,
    raw?.raw?.transaction?.message,
    raw?.raw?.transaction?.transaction?.message,
    raw?.parsed?.transaction?.message,
  ];

  pushInstructions(instructions, raw?.instructions);
  pushInstructions(instructions, raw?.raw?.instructions);

  for (const message of messages) {
    pushInstructions(instructions, message?.instructions);
    pushInstructions(instructions, message?.compiledInstructions);
  }

  pushInnerInstructions(instructions, raw?.innerInstructions);
  pushInnerInstructions(instructions, raw?.meta?.innerInstructions);
  pushInnerInstructions(instructions, raw?.transaction?.meta?.innerInstructions);
  pushInnerInstructions(instructions, raw?.raw?.innerInstructions);
  pushInnerInstructions(instructions, raw?.raw?.meta?.innerInstructions);
  pushInnerInstructions(instructions, raw?.raw?.transaction?.meta?.innerInstructions);

  return instructions;
}

export function resolveSolanaInstructionProgramId(
  instruction: any,
  accountKeys: string[],
): string | null {
  const direct = normalizePublicKey(instruction?.programId);
  if (direct) {
    return direct;
  }

  const programIdIndex = instruction?.programIdIndex;
  if (Number.isInteger(programIdIndex)) {
    return accountKeys[programIdIndex] || null;
  }

  return null;
}

export function resolveSolanaInstructionAccounts(
  instruction: any,
  accountKeys: string[],
): string[] {
  const decodedAccounts = !Array.isArray(instruction?.accounts)
    ? decodeSerializedBuffer(instruction?.accounts)
    : null;
  const decodedAccountKeyIndexes = !Array.isArray(instruction?.accountKeyIndexes)
    ? decodeSerializedBuffer(instruction?.accountKeyIndexes)
    : null;
  const accounts = decodedAccounts
    ? Array.from(decodedAccounts)
    : Array.isArray(instruction?.accounts)
      ? instruction.accounts
      : decodedAccountKeyIndexes
        ? Array.from(decodedAccountKeyIndexes)
        : Array.isArray(instruction?.accountKeyIndexes)
          ? instruction.accountKeyIndexes
          : [];

  const resolved: string[] = [];
  for (const account of accounts) {
    if (Number.isInteger(account)) {
      const pubkey = accountKeys[account];
      if (pubkey) {
        resolved.push(pubkey);
      }
      continue;
    }

    const pubkey = normalizePublicKey(account);
    if (pubkey) {
      resolved.push(pubkey);
    }
  }

  return resolved;
}
