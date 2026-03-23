/**
 * firebirdPool.ts — Pool de conexiones a Firebird.
 *
 * A diferencia de firebird.ts (que abre y cierra una conexión por consulta),
 * este módulo REUTILIZA conexiones. Mantiene un pool por cada combinación
 * host:port:database:user, con un máximo de 5 conexiones simultáneas.
 *
 * Características:
 *  - Si hay conexiones libres, las reutiliza.
 *  - Si el pool está lleno, la petición queda en cola hasta que se libere una.
 *  - Conexiones sin uso por 5 minutos se cierran automáticamente.
 *  - Limpieza de inactivas cada 60 segundos.
 *
 * Exporta:
 *  - executeQuery() → ejecuta una consulta SQL usando el pool
 *  - disposePool()  → cierra todas las conexiones
 *  - getPoolStats() → estadísticas del pool para monitoreo
 */

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

const isVerbose = process.env.FIREBIRD_LOG_VERBOSE === 'true';

/* ═══════════════════════════════════════════
   Tipos internos del pool
═══════════════════════════════════════════ */

/** Entrada del pool: un client + attachment + estado */
type PoolEntry = {
  client: Client;
  attachment: Attachment;
  /** true si esta conexión está siendo usada por una consulta */
  inUse: boolean;
  /** Timestamp de último uso (para limpieza por inactividad) */
  lastUsed: number;
};

/** Resolver de una promesa esperando una conexión libre */
type PendingResolver = (entry: PoolEntry) => void;

/** Pool completo para una combinación de host/db/user */
type FirebirdPool = {
  entries: PoolEntry[];
  pending: PendingResolver[];
  maxSize: number;
  options: FirebirdConnectionConfig;
};

/* ═══════════════════════════════════════════
   Estado global del pool
═══════════════════════════════════════════ */

/** Mapa de pools indexado por clave "host:port:database:user" */
const poolByKey = new Map<string, FirebirdPool>();

/** Máximo de conexiones simultáneas por pool */
const POOL_MAX_SIZE = 5;

/** Tiempo máximo de inactividad antes de cerrar la conexión (5 min) */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/* ═══════════════════════════════════════════
   Funciones de conexión (similares a firebird.ts)
═══════════════════════════════════════════ */

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

/**
 * Abre una nueva conexión a Firebird.
 * NOTA: No loguea contraseñas por seguridad.
 */
const openAttachment = async (
  options: FirebirdConnectionConfig
): Promise<{ client: Client; attachment: Attachment }> => {
  if (isVerbose) {
    console.info('[firebirdPool] Connecting:', {
      host: options.host,
      port: options.port,
      database: options.database,
      user: options.user,
    });
  }
  const client = createClient(options);
  const uri = buildDatabaseUri(options);
  try {
    const attachment = await client.connect(uri);
    return { client, attachment };
  } catch (error) {
    console.error('[firebirdPool] Connection failed', error);
    await client.dispose();
    throw error;
  }
};

const startReadOnlyTransaction = async (
  attachment: Attachment
): Promise<Transaction> =>
  attachment.startTransaction({
    isolation: 'READ_COMMITTED' as any,
    readCommittedMode: 'RECORD_VERSION',
    accessMode: 'READ_ONLY',
  });

/* ═══════════════════════════════════════════
   Gestión del pool de conexiones
═══════════════════════════════════════════ */

/** Genera una clave única para identificar un pool por host:port:database:user */
const buildPoolKey = (options: FirebirdConnectionConfig): string =>
  [
    options.host || 'local',
    options.port,
    options.database,
    options.user,
  ].join(':');

/** Obtiene un pool existente o crea uno nuevo para la configuración dada. */
const getOrCreatePool = (options: FirebirdConnectionConfig): FirebirdPool => {
  const key = buildPoolKey(options);
  let pool = poolByKey.get(key);

  if (!pool) {
    pool = {
      entries: [],
      pending: [],
      maxSize: POOL_MAX_SIZE,
      options,
    };
    poolByKey.set(key, pool);
  }

  return pool;
};

/**
 * Adquiere una conexión del pool:
 * 1. Si hay una libre, la marca como en uso.
 * 2. Si no pero hay espacio, crea una nueva.
 * 3. Si el pool está lleno, queda en espera hasta que se libere una.
 */
const acquireFromPool = async (pool: FirebirdPool): Promise<PoolEntry> => {
  // Buscar una conexión libre
  const freeEntry = pool.entries.find(e => !e.inUse);
  if (freeEntry) {
    freeEntry.inUse = true;
    freeEntry.lastUsed = Date.now();
    return freeEntry;
  }

  // Si hay espacio, crear nueva conexión
  if (pool.entries.length < pool.maxSize) {
    const { client, attachment } = await openAttachment(pool.options);
    const entry: PoolEntry = {
      client,
      attachment,
      inUse: true,
      lastUsed: Date.now(),
    };
    pool.entries.push(entry);
    return entry;
  }

  // Si no hay espacio, esperar a que se libere una conexión
  return new Promise<PoolEntry>((resolve) => {
    pool.pending.push(resolve);
  });
};

/**
 * Devuelve una conexión al pool tras usarla.
 * Si hay peticiones en cola, le asigna la conexión inmediatamente.
 */
const releaseToPool = (pool: FirebirdPool, entry: PoolEntry): void => {
  entry.inUse = false;
  entry.lastUsed = Date.now();

  const pendingResolver = pool.pending.shift();
  if (pendingResolver) {
    entry.inUse = true;
    pendingResolver(entry);
  }
};

/** Cierra conexiones que llevan más de IDLE_TIMEOUT_MS sin usarse. */
const cleanupIdleConnections = async (pool: FirebirdPool): Promise<void> => {
  const now = Date.now();
  const entriesToRemove: PoolEntry[] = [];

  for (const entry of pool.entries) {
    if (!entry.inUse && now - entry.lastUsed > IDLE_TIMEOUT_MS) {
      entriesToRemove.push(entry);
    }
  }

  for (const entry of entriesToRemove) {
    try {
      await entry.attachment.disconnect();
      await entry.client.dispose();
      const index = pool.entries.indexOf(entry);
      if (index > -1) {
        pool.entries.splice(index, 1);
      }
    } catch (error) {
      console.error('[firebirdPool] Error cleaning up idle connection:', error);
    }
  }
};

// Limpieza automática de conexiones inactivas cada 60 segundos
setInterval(() => {
  for (const pool of poolByKey.values()) {
    cleanupIdleConnections(pool).catch((error) => {
      console.error('[firebirdPool] Error during cleanup:', error);
    });
  }
}, 60 * 1000);

/* ═══════════════════════════════════════════
   API pública del pool
═══════════════════════════════════════════ */

/**
 * Ejecuta una consulta SQL usando el pool de conexiones.
 * Adquiere una conexión, ejecuta la consulta en una transacción
 * de solo lectura y devuelve la conexión al pool.
 */
export const executeQuery = async <T extends object = Record<string, unknown>>(
  options: FirebirdConnectionConfig,
  sql: string,
  params: unknown[] = []
): Promise<T[]> => {
  const pool = getOrCreatePool(options);
  const entry = await acquireFromPool(pool);
  const transaction = await startReadOnlyTransaction(entry.attachment);

  try {
    const resultSet = await entry.attachment.executeQuery(transaction, sql, params);
    const rows = await resultSet.fetchAsObject<T>();
    await resultSet.close();
    await transaction.commit();
    return rows;
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_rollbackError) {
      // Ignorar errores de rollback para mostrar el error original
    }
    throw error;
  } finally {
    releaseToPool(pool, entry);
  }
};

/** Cierra todas las conexiones de todos los pools y libera recursos. */
export const disposePool = async (): Promise<void> => {
  for (const [key, pool] of poolByKey.entries()) {
    for (const entry of pool.entries) {
      try {
        await entry.attachment.disconnect();
        await entry.client.dispose();
      } catch (error) {
        console.error('[firebirdPool] Error disposing connection:', error);
      }
    }
    poolByKey.delete(key);
  }
};

/**
 * Devuelve estadísticas del pool para monitoreo / debugging.
 * Útil para diagnosticar problemas de conexiones.
 */
export const getPoolStats = (options: FirebirdConnectionConfig) => {
  const key = buildPoolKey(options);
  const pool = poolByKey.get(key);

  if (!pool) {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      pendingRequests: 0,
    };
  }

  return {
    totalConnections: pool.entries.length,
    activeConnections: pool.entries.filter(e => e.inUse).length,
    idleConnections: pool.entries.filter(e => !e.inUse).length,
    pendingRequests: pool.pending.length,
  };
};
