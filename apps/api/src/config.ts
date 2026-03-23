/**
 * config.ts — Configuración centralizada de la aplicación.
 *
 * Lee las variables de entorno del archivo .env (usando dotenv) y expone
 * un objeto `config` con todos los valores que necesita la API:
 * puerto del servidor, credenciales de Firebird, JWT, etc.
 *
 * Si falta una variable obligatoria, la aplicación lanza un error al arrancar.
 */

import dotenv from 'dotenv';

// Carga las variables de entorno desde el archivo .env
dotenv.config();

/* ═══════════════════════════════════════════
   Funciones auxiliares para leer variables
   de entorno con validación
═══════════════════════════════════════════ */

/**
 * Obtiene una variable de entorno por nombre.
 * Lanza un error si no existe y no se proporciona un valor por defecto.
 */
const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

/**
 * Intenta obtener una variable de entorno probando varios nombres posibles.
 * Útil cuando se migra entre convenciones (ej: FB_HOST → FIREBIRD_HOST).
 */
const getEnvAny = (keys: string[], defaultValue?: string): string => {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined) {
      return value;
    }
  }

  if (defaultValue !== undefined) {
    return defaultValue;
  }

  throw new Error(`Missing required environment variable: ${keys.join(' or ')}`);
};

/** Obtiene una variable de entorno y la convierte a número entero. */
const getEnvNumber = (key: string, defaultValue?: string): number => {
  const rawValue = getEnv(key, defaultValue);
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }

  return parsed;
};

/** Combina getEnvAny + conversión a entero. */
const getEnvNumberAny = (keys: string[], defaultValue?: string): number => {
  const rawValue = getEnvAny(keys, defaultValue);
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${keys.join(' or ')} must be a number`);
  }

  return parsed;
};

/* ═══════════════════════════════════════════
   Objeto de configuración principal
═══════════════════════════════════════════ */

export const config = {
  /** Entorno de ejecución: development | production */
  env: process.env.NODE_ENV ?? 'development',

  /** Puerto en que escucha el servidor HTTP */
  port: parseInt(getEnv('PORT', '3000'), 10),

  /** Clave de API para proteger endpoints públicos */
  apiKey: getEnv('API_KEY', ''),

  /** Secreto para firmar / verificar tokens JWT */
  jwtSecret: getEnv('JWT_SECRET'),

  /** Tiempo de expiración de los tokens JWT (ej: '12h', '1d') */
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '12h'),

  /** URL genérica de base de datos (usada si aplica) */
  databaseUrl: getEnv('DATABASE_URL', ''),

  /** Configuración de conexión a la base de datos Firebird */
  firebird: {
    host: getEnvAny(['FIREBIRD_HOST', 'FB_HOST'], '192.168.191.108'),
    port: getEnvNumberAny(['FIREBIRD_PORT', 'FB_PORT'], '3050'),
    database: getEnvAny(['FIREBIRD_DATABASE', 'FB_DATABASE']),
    user: getEnvAny(['FIREBIRD_USER', 'FB_USER']),
    password: getEnvAny(['FIREBIRD_PASSWORD', 'FB_PASSWORD']),
    role: process.env.FIREBIRD_ROLE,
    /** Ruta al cliente nativo de Firebird (fbclient.dll / libfbclient.so) */
    client: process.env.FB_CLIENT_LIBRARY ?? process.env.FIREBIRD_CLIENT,
    /** Si es true, convierte los nombres de columna a minúsculas */
    lowercaseKeys: process.env.FIREBIRD_LOWERCASE_KEYS === 'true',
    retryConnectionInterval: getEnvNumber('FIREBIRD_RETRY_INTERVAL_MS', '0'),
    /** Cantidad máxima de conexiones simultáneas en el pool */
    poolSize: getEnvNumber('FIREBIRD_POOL_SIZE', '5'),
  },

  /** Configuración explícita para BD central (DUOCOMAPPS) */
  centralFirebird: {
    host: getEnvAny(['FIREBIRD_CENTRAL_HOST', 'FIREBIRD_HOST', 'FB_HOST'], '192.168.191.108'),
    port: getEnvNumberAny(['FIREBIRD_CENTRAL_PORT', 'FIREBIRD_PORT', 'FB_PORT'], '3050'),
    database: getEnvAny(['FIREBIRD_CENTRAL_DATABASE', 'FIREBIRD_DATABASE', 'FB_DATABASE']),
    user: getEnvAny(['FIREBIRD_CENTRAL_USER', 'FIREBIRD_USER', 'FB_USER']),
    password: getEnvAny(['FIREBIRD_CENTRAL_PASSWORD', 'FIREBIRD_PASSWORD', 'FB_PASSWORD']),
    role: process.env.FIREBIRD_CENTRAL_ROLE ?? process.env.FIREBIRD_ROLE,
    client: process.env.FIREBIRD_CENTRAL_CLIENT ?? process.env.FB_CLIENT_LIBRARY ?? process.env.FIREBIRD_CLIENT,
    lowercaseKeys: process.env.FIREBIRD_LOWERCASE_KEYS === 'true',
    retryConnectionInterval: getEnvNumber('FIREBIRD_RETRY_INTERVAL_MS', '0'),
    poolSize: getEnvNumber('FIREBIRD_POOL_SIZE', '5'),
  },
};

// Log de inicio — muestra la configuración de Firebird SIN contraseña
console.info('[config] Firebird config loaded:', {
  host: config.firebird.host,
  port: config.firebird.port,
  database: config.firebird.database,
  user: config.firebird.user,
  poolSize: config.firebird.poolSize,
});

console.info('[config] Central Firebird config loaded:', {
  host: config.centralFirebird.host,
  port: config.centralFirebird.port,
  database: config.centralFirebird.database,
  user: config.centralFirebird.user,
  poolSize: config.centralFirebird.poolSize,
});
