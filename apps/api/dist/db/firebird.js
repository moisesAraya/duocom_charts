"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disposeClient = exports.query = void 0;
const node_fs_1 = __importDefault(require("node:fs"));
const node_firebird_driver_native_1 = require("node-firebird-driver-native");
const config_1 = require("../config");
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
            console.info(`[firebird] Using client library: ${library}`);
            return client;
        }
        catch (error) {
            console.warn(`[firebird] Failed to load client library: ${library}`);
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
    console.info(`[firebird] Connecting to ${uri} as ${options.user}`);
    try {
        const attachment = await client.connect(uri);
        console.info('[firebird] Connection established');
        return { client, attachment };
    }
    catch (error) {
        console.error('[firebird] Connection failed', error);
        await client.dispose();
        throw error;
    }
};
const startReadOnlyTransaction = async (attachment) => attachment.startTransaction({
    isolation: 'READ_COMMITTED',
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
const query = async (sql, params = [], options = config_1.config.firebird) => {
    const { client, attachment } = await openAttachment(options);
    const transaction = await startReadOnlyTransaction(attachment);
    try {
        const resultSet = await attachment.executeQuery(transaction, sql, params);
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
            // Ignorar errores de rollback para mostrar el error original
        }
        throw error;
    }
    finally {
        try {
            await attachment.disconnect();
        }
        catch (disconnectError) {
            // Ignorar errores de desconexión
        }
        try {
            await client.dispose();
        }
        catch (disposeError) {
            // Ignorar errores de dispose
        }
    }
};
exports.query = query;
/**
 * No-op: los clientes se crean por consulta y se desechan inmediatamente.
 * Esta función existe por compatibilidad.
 */
const disposeClient = async () => {
    // No hace nada, los clientes se desechan automáticamente
};
exports.disposeClient = disposeClient;
