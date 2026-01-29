"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPoolStats = exports.disposePool = exports.executeQuery = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_firebird_driver_native_1 = require("node-firebird-driver-native");
const poolByKey = new Map();
const POOL_MAX_SIZE = 5;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos
const buildDatabaseUri = (options) => {
    if (options.host) {
        return `${options.host}/${options.port}:${options.database}`;
    }
    return options.database;
};
const resolveLibraries = (customLibraryPath) => {
    const candidates = [];
    const customLibrary = customLibraryPath?.trim();
    if (customLibrary && node_fs_1.default.existsSync(customLibrary)) {
        candidates.push(customLibrary);
    }
    candidates.push((0, node_firebird_driver_native_1.getDefaultLibraryFilename)());
    return candidates;
};
const createClientWithFallback = (customLibraryPath) => {
    const libraries = resolveLibraries(customLibraryPath);
    let lastError;
    for (const library of libraries) {
        try {
            const client = (0, node_firebird_driver_native_1.createNativeClient)(library);
            return client;
        }
        catch (error) {
            lastError = error;
        }
    }
    throw lastError;
};
const createClient = (options) => {
    const client = createClientWithFallback(options.client);
    client.defaultConnectOptions = {
        username: options.user,
        password: options.password,
        role: options.role ?? undefined,
    };
    return client;
};
const openAttachment = async (options) => {
    const client = createClient(options);
    const uri = buildDatabaseUri(options);
    try {
        const attachment = await client.connect(uri);
        return { client, attachment };
    }
    catch (error) {
        console.error('❌ [DB Pool] Connection failed', error);
        await client.dispose();
        throw error;
    }
};
const startReadOnlyTransaction = async (attachment) => attachment.startTransaction({
    isolation: 'READ_COMMITTED',
    readCommittedMode: 'RECORD_VERSION',
    accessMode: 'READ_ONLY',
});
const buildPoolKey = (options) => [
    options.host || 'local',
    options.port,
    options.database,
    options.user,
].join(':');
const getOrCreatePool = (options) => {
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
const acquireFromPool = async (pool) => {
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
        const entry = {
            client,
            attachment,
            inUse: true,
            lastUsed: Date.now(),
        };
        pool.entries.push(entry);
        return entry;
    }
    // Si no hay espacio, esperar a que se libere una conexión
    return new Promise((resolve) => {
        pool.pending.push(resolve);
    });
};
const releaseToPool = (pool, entry) => {
    entry.inUse = false;
    entry.lastUsed = Date.now();
    // Si hay solicitudes pendientes, asignar la conexión
    const pendingResolver = pool.pending.shift();
    if (pendingResolver) {
        entry.inUse = true;
        pendingResolver(entry);
    }
};
const cleanupIdleConnections = async (pool) => {
    const now = Date.now();
    const entriesToRemove = [];
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
        }
        catch (error) {
            console.error('❌ [DB Pool] Error cleaning up idle connection:', error);
        }
    }
};
// Ejecutar limpieza cada minuto
setInterval(() => {
    for (const pool of poolByKey.values()) {
        cleanupIdleConnections(pool).catch((error) => {
            console.error('❌ [DB Pool] Error during cleanup:', error);
        });
    }
}, 60 * 1000);
/**
 * Ejecuta una consulta SQL usando un pool de conexiones.
 * Reutiliza conexiones existentes para mejorar el rendimiento.
 *
 * @param options - Configuración de conexión
 * @param sql - Consulta SQL a ejecutar
 * @param params - Parámetros de la consulta
 * @returns Array de objetos con los resultados
 */
const executeQuery = async (options, sql, params = []) => {
    const pool = getOrCreatePool(options);
    const entry = await acquireFromPool(pool);
    const transaction = await startReadOnlyTransaction(entry.attachment);
    try {
        const resultSet = await entry.attachment.executeQuery(transaction, sql, params);
        const rows = await resultSet.fetchAsObject();
        await resultSet.close();
        await transaction.commit();
        return rows;
    }
    catch (error) {
        try {
            await transaction.rollback();
        }
        catch (rollbackError) {
            // Ignorar errores de rollback
        }
        throw error;
    }
    finally {
        releaseToPool(pool, entry);
    }
};
exports.executeQuery = executeQuery;
/**
 * Cierra todas las conexiones del pool y limpia los recursos.
 */
const disposePool = async () => {
    for (const [key, pool] of poolByKey.entries()) {
        for (const entry of pool.entries) {
            try {
                await entry.attachment.disconnect();
                await entry.client.dispose();
            }
            catch (error) {
                console.error('❌ [DB Pool] Error disposing connection:', error);
            }
        }
        poolByKey.delete(key);
    }
};
exports.disposePool = disposePool;
/**
 * Obtiene estadísticas del pool para monitoreo.
 */
const getPoolStats = (options) => {
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
exports.getPoolStats = getPoolStats;
