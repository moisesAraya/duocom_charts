import dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

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

const getEnvNumber = (key: string, defaultValue?: string): number => {
  const rawValue = getEnv(key, defaultValue);
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }

  return parsed;
};

const getEnvNumberAny = (keys: string[], defaultValue?: string): number => {
  const rawValue = getEnvAny(keys, defaultValue);
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${keys.join(' or ')} must be a number`);
  }

  return parsed;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(getEnv('PORT', '3000'), 10),
  apiKey: getEnv('API_KEY', ''),
  jwtSecret: getEnv('JWT_SECRET'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '12h'),
  databaseUrl: getEnv('DATABASE_URL', ''),
  firebird: {
    host: getEnvAny(['FIREBIRD_HOST', 'FB_HOST'], '192.168.18.79'),
    port: getEnvNumberAny(['FIREBIRD_PORT', 'FB_PORT'], '350'),
    database: getEnvAny(['FIREBIRD_DATABASE', 'FB_DATABASE']),
    user: getEnvAny(['FIREBIRD_USER', 'FB_USER']),
    password: getEnvAny(['FIREBIRD_PASSWORD', 'FB_PASSWORD']),
    role: process.env.FIREBIRD_ROLE,
    client: process.env.FB_CLIENT_LIBRARY ?? process.env.FIREBIRD_CLIENT,
    lowercaseKeys: process.env.FIREBIRD_LOWERCASE_KEYS === 'true',
    retryConnectionInterval: getEnvNumber('FIREBIRD_RETRY_INTERVAL_MS', '0'),
    poolSize: getEnvNumber('FIREBIRD_POOL_SIZE', '5'),
  },
};
