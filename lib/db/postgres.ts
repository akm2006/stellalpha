import { Pool, types } from 'pg';

const NUMERIC_OID = 1700;
const INT8_OID = 20;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;

types.setTypeParser(NUMERIC_OID, (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
});

types.setTypeParser(INT8_OID, (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
});

let pool: Pool | null = null;

function getConnectionString() {
  return process.env.LIVE_PILOT_DATABASE_URL || process.env.DATABASE_URL || '';
}

function requireConnectionString() {
  const connectionString = getConnectionString();
  if (!connectionString) {
    throw new Error('Missing LIVE_PILOT_DATABASE_URL or DATABASE_URL');
  }
  return connectionString;
}

function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function hasPostgresConnection() {
  return Boolean(getConnectionString());
}

export function getPostgresPool() {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    connectionString: requireConnectionString(),
    ssl: { rejectUnauthorized: false },
    max: toPositiveInt(process.env.LIVE_PILOT_PG_POOL_MAX, 5),
    connectionTimeoutMillis: toPositiveInt(
      process.env.LIVE_PILOT_PG_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
    idleTimeoutMillis: toPositiveInt(
      process.env.LIVE_PILOT_PG_IDLE_TIMEOUT_MS,
      DEFAULT_IDLE_TIMEOUT_MS,
    ),
    query_timeout: toPositiveInt(
      process.env.LIVE_PILOT_PG_QUERY_TIMEOUT_MS,
      DEFAULT_QUERY_TIMEOUT_MS,
    ),
    application_name: process.env.LIVE_PILOT_PG_APPLICATION_NAME || 'stellalpha-live-pilot',
  });

  pool.on('error', (error) => {
    console.error('[POSTGRES] Idle client error:', error);
  });

  return pool;
}

export async function pgQuery<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const result = await getPostgresPool().query(text, values);
  return result.rows.map(normalizePgRow) as T[];
}

export async function pgMaybeOne<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const rows = await pgQuery<T>(text, values);
  return rows[0] || null;
}

export async function pgOne<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
  const row = await pgMaybeOne<T>(text, values);
  if (!row) {
    throw new Error('Expected Postgres query to return one row');
  }
  return row;
}

export function normalizePgRow(row: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return normalized;
}

export function buildUpdateAssignments(
  patch: Record<string, unknown>,
  startParamIndex: number = 2,
) {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  return {
    assignments: entries.map(([key], index) => `${key} = $${startParamIndex + index}`),
    values: entries.map(([, value]) => value),
  };
}
