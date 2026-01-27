import fs from 'node:fs';
import {
  createNativeClient,
  getDefaultLibraryFilename,
  type Attachment,
  type Client,
  type Transaction,
} from 'node-firebird-driver-native';
import { config } from '../config';
import type { FirebirdConnectionConfig } from './firebird';

type PoolEntry = {
  client: Client;
  attachment: Attachment;
  inUse: boolean;
};

type PendingResolver = (entry: PoolEntry) => void;

type FirebirdPool = {
  entries: PoolEntry[];
  pending: PendingResolver[];
  maxSize: number;
  options: FirebirdConnectionConfig;
};

const poolByKey = new Map<string, FirebirdPool>();

const buildDatabaseUri = (options: FirebirdConnectionConfig): string => {
  if (options.host) {
    return `${options.host}/${options.port}:${options.database}`;
  }

  return options.database;
};

const resolveLibraries = (customLibraryPath?: string | null): string[] => {
  const candidates: string[] = [];
  const customLibrary = customLibraryPath?.trim();
  if (customLibrary && fs.existsSync(customLibrary)) {
    candidates.push(customLibrary);
  }

  candidates.push(getDefaultLibraryFilename());
  return candidates;
};

const createClientWithFallback = (customLibraryPath?: string | null): Client => {
  const libraries = resolveLibraries(customLibraryPath);
  let lastError: unknown;

  for (const library of libraries) {
    try {
      const client = createNativeClient(library);
      return client;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const createClient = (options: FirebirdConnectionConfig): Client => {
  const client = createClientWithFallback(options.client);
  client.defaultConnectOptions = {
    username: options.user,
    password: options.password,
    role: options.role ?? undefined,
  };
  return client;
};

const openAttachment = async (
  options: FirebirdConnectionConfig
): Promise<{ client: Client; attachment: Attachment }> => {
  const client = createClient(options);
  const uri = buildDatabaseUri(options);
  try {
    const attachment = await client.connect(uri);
    return { client, attachment };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ [DB] Connection failed', error);
    await client.dispose();
    throw error;
  }
};

const startReadOnlyTransaction = async (
  attachment: Attachment
): Promise<Transaction> =>
  attachment.startTransaction({
    isolation: 'READ_COMMITTED',
    readCommittedMode: 'RECORD_VERSION',
    accessMode: 'READ_ONLY',
  });

const buildPoolKey = (options: FirebirdConnectionConfig): string =>
  [
    options.host ?? '',
    options.port,
    options.database,
    options.user,
    options.role ?? '',
    options.client ?? '',
  ].join('|');

const createPool = (options: FirebirdConnectionConfig): FirebirdPool => ({
  entries: [],
  pending: [],
  maxSize: Math.max(config.firebird.poolSize, 1),
  options,
});

const getPool = (options: FirebirdConnectionConfig): FirebirdPool => {
  const key = buildPoolKey(options);
  const existing = poolByKey.get(key);
  if (existing) return existing;
  const pool = createPool(options);
  poolByKey.set(key, pool);
  return pool;
};

const createEntry = async (pool: FirebirdPool): Promise<PoolEntry> => {
  const { client, attachment } = await openAttachment(pool.options);
  return { client, attachment, inUse: false };
};

const acquire = async (pool: FirebirdPool): Promise<PoolEntry> => {
  const idle = pool.entries.find(entry => !entry.inUse);
  if (idle) {
    idle.inUse = true;
    return idle;
  }

  if (pool.entries.length < pool.maxSize) {
    const entry = await createEntry(pool);
    entry.inUse = true;
    pool.entries.push(entry);
    return entry;
  }

  return new Promise(resolve => {
    pool.pending.push(resolve);
  });
};

const release = (pool: FirebirdPool, entry: PoolEntry) => {
  const waiter = pool.pending.shift();
  if (waiter) {
    entry.inUse = true;
    waiter(entry);
    return;
  }
  entry.inUse = false;
};

const destroyEntry = async (pool: FirebirdPool, entry: PoolEntry) => {
  const index = pool.entries.indexOf(entry);
  if (index >= 0) {
    pool.entries.splice(index, 1);
  }

  try {
    await entry.attachment.disconnect();
  } catch (error) {
    // Ignore disconnect errors.
  }

  try {
    await entry.client.dispose();
  } catch (error) {
    // Ignore dispose errors.
  }

  if (pool.pending.length && pool.entries.length < pool.maxSize) {
    try {
      const replacement = await createEntry(pool);
      replacement.inUse = true;
      pool.entries.push(replacement);
      const waiter = pool.pending.shift();
      if (waiter) {
        waiter(replacement);
      } else {
        replacement.inUse = false;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('❌ [DB] Failed to replenish pool', error);
    }
  }
};

export const executeQuery = async <T extends object = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: FirebirdConnectionConfig = config.firebird
): Promise<T[]> => {
  const pool = getPool(options);
  const entry = await acquire(pool);
  let transaction: Transaction | null = null;
  let shouldDestroy = false;

  try {
    transaction = await startReadOnlyTransaction(entry.attachment);
    const resultSet = await entry.attachment.executeQuery(transaction, sql, params);
    const rows = await resultSet.fetchAsObject<T>();
    await resultSet.close();
    await transaction.commit();
    return rows;
  } catch (error) {
    shouldDestroy = true;
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        // Ignore rollback errors so we surface the original exception.
      }
    }
    throw error;
  } finally {
    if (shouldDestroy) {
      await destroyEntry(pool, entry);
    } else {
      release(pool, entry);
    }
  }
};
