import fs from 'node:fs';
import {
  createNativeClient,
  getDefaultLibraryFilename,
  type Attachment,
  type Client,
  type Transaction,
} from 'node-firebird-driver-native';
import { config } from '../config';

export type FirebirdConnectionConfig = {
  host?: string;
  port: number;
  database: string;
  user: string;
  password: string;
  role?: string | null;
  client?: string | null;
};

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
      // eslint-disable-next-line no-console
      console.info(`[firebird] Using client library: ${library}`);
      return client;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[firebird] Failed to load client library: ${library}`);
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
  // eslint-disable-next-line no-console
  console.info(`[firebird] Connecting to ${uri} as ${options.user}`);
  try {
    const attachment = await client.connect(uri);
    // eslint-disable-next-line no-console
    console.info('[firebird] Connection established');
    return { client, attachment };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[firebird] Connection failed', error);
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

export const query = async <T extends object = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: FirebirdConnectionConfig = config.firebird
): Promise<T[]> => {
  const { client, attachment } = await openAttachment(options);
  const transaction = await startReadOnlyTransaction(attachment);

  try {
    const resultSet = await attachment.executeQuery(transaction, sql, params);
    const rows = await resultSet.fetchAsObject<T>();
    await resultSet.close();
    await transaction.commit();
    return rows;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      // Ignore rollback errors so we surface the original exception.
    }
    throw error;
  } finally {
    try {
      await attachment.disconnect();
    } catch (disconnectError) {
      // Ignore disconnect errors to avoid masking the real failure.
    }
    try {
      await client.dispose();
    } catch (disposeError) {
      // Ignore dispose errors to avoid masking the real failure.
    }
  }
};

export const disposeClient = async (): Promise<void> => {
  // No-op: clients are created per query and disposed immediately.
};
