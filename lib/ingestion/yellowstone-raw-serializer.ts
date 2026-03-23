function serializeBuffer(value: Uint8Array) {
  return {
    __type: 'buffer',
    encoding: 'base64',
    data: Buffer.from(value).toString('base64'),
  };
}

export function serializeYellowstoneRaw(value: unknown): unknown {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return {
      __type: 'bigint',
      value: value.toString(),
    };
  }

  if (value instanceof Date) {
    return {
      __type: 'date',
      value: value.toISOString(),
    };
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return serializeBuffer(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeYellowstoneRaw(item));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, serializeYellowstoneRaw(item)])
    );
  }

  return String(value);
}
