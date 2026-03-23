/**
 * firebird.ts — Cliente de conexión simple a Firebird.
 *
 * Crea una conexión nueva para CADA consulta y la cierra al terminar.
 * Es el módulo más simple de acceso a BD; para reutilizar conexiones
 * existe firebirdPool.ts (pool de conexiones).
 *
 * Exporta:
 *  - query()         → ejecuta una consulta SQL read-only
 *  - disposeClient() → no-op, existe por compatibilidad
 *  - FirebirdConnectionConfig (tipo)
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

const isVerbose = process.env.FIREBIRD_LOG_VERBOSE === 'true';

/* ═══════════════════════════════════════════
   Tipo de configuración de conexión
═══════════════════════════════════════════ */

/** Datos necesarios para conectarse a una BD Firebird */
export type FirebirdConnectionConfig = {
  host?: string;
  port: number;
  database: string;
  user: string;
  password: string;
  role?: string | null;
  /** Ruta a la librería nativa del cliente Firebird */
  client?: string | null;
};

/* ═══════════════════════════════════════════
   Conexión al servidor Firebird
═══════════════════════════════════════════ */

/** Construye la URI de conexión: "host/port:database" o solo "database" si es local. */
const buildDatabaseUri = (options: FirebirdConnectionConfig): string => {
  if (options.host) {
    return `${options.host}/${options.port}:${options.database}`;
  }
  return options.database;
};

/**
 * Resuelve la lista de rutas candidatas para la librería nativa de Firebird.
 * Primero intenta con la ruta personalizada (de .env), si no existe usa la por defecto.
 */
const resolveLibraries = (customLibraryPath?: string | null): string[] => {
  const candidates: string[] = [];
  const customLibrary = customLibraryPath?.trim();
  if (customLibrary && fs.existsSync(customLibrary)) {
    candidates.push(customLibrary);
  }
  candidates.push(getDefaultLibraryFilename());
  return candidates;
};

/**
 * Crea el cliente nativo de Firebird probando con cada librería candidata.
 * Si la primera falla, intenta con la siguiente.
 */
const createClientWithFallback = (customLibraryPath?: string | null): Client => {
  const libraries = resolveLibraries(customLibraryPath);
  let lastError: unknown;

  for (const library of libraries) {
    try {
      const client = createNativeClient(library);
      if (isVerbose) {
        console.info(`[firebird] Using client library: ${library}`);
      }
      return client;
    } catch (error) {
      if (isVerbose) {
        console.warn(`[firebird] Failed to load client library: ${library}`);
      }
      lastError = error;
    }
  }

  throw lastError;
};

/** Crea un cliente Firebird configurado con las credenciales dadas. */
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
 * Abre una conexión (attachment) a la base de datos Firebird.
 * Devuelve el client y el attachment para usarlos en consultas.
 */
const openAttachment = async (
  options: FirebirdConnectionConfig
): Promise<{ client: Client; attachment: Attachment }> => {
  const client = createClient(options);
  const uri = buildDatabaseUri(options);
  if (isVerbose) {
    console.info(`[firebird] Connecting to ${uri}`);
  }
  try {
    const attachment = await client.connect(uri);
    if (isVerbose) {
      console.info('[firebird] Connection established');
    }
    return { client, attachment };
  } catch (error) {
    console.error('[firebird] Connection failed', error);
    await client.dispose();
    throw error;
  }
};

/** Inicia una transacción de solo lectura (READ_COMMITTED + READ_ONLY). */
const startReadOnlyTransaction = async (
  attachment: Attachment
): Promise<Transaction> =>
  attachment.startTransaction({
    isolation: 'READ_COMMITTED' as any,
    readCommittedMode: 'RECORD_VERSION',
    accessMode: 'READ_ONLY',
  });

/**
 * Ejecuta una consulta SQL de solo lectura en la base de datos Firebird.
 * Crea una nueva conexión para cada consulta y la cierra al finalizar.
 * 
 * @param sql - Consulta SQL a ejecutar
 * @param params - Parámetros de la consulta
 * @param options - Configuración de conexión (usa config.db por defecto)
 * @returns Array de objetos con los resultados
 */
export const query = async <T extends object = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  options: FirebirdConnectionConfig = config.firebird as any
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
      // Ignorar errores de rollback para mostrar el error original
    }
    throw error;
  } finally {
    try {
      await attachment.disconnect();
    } catch (disconnectError) {
      // Ignorar errores de desconexión
    }
    try {
      await client.dispose();
    } catch (disposeError) {
      // Ignorar errores de dispose
    }
  }
};

/**
 * No-op: los clientes se crean por consulta y se desechan inmediatamente.
 * Esta función existe por compatibilidad.
 */
export const disposeClient = async (): Promise<void> => {
  // No hace nada, los clientes se desechan automáticamente
};
