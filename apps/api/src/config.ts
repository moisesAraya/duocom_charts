import dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const getEnvNumber = (key: string, defaultValue?: string): number => {
  const rawValue = getEnv(key, defaultValue);
  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }

  return parsed;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(getEnv('PORT', '3000'), 10),
  apiKey: getEnv('API_KEY', ''),
  databaseUrl: getEnv('DATABASE_URL', ''),
  firebird: {
    host: getEnv('FIREBIRD_HOST', 'localhost'),
    port: getEnvNumber('FIREBIRD_PORT', '3050'),
    database: getEnv('FIREBIRD_DATABASE'),
    user: getEnv('FIREBIRD_USER'),
    password: getEnv('FIREBIRD_PASSWORD'),
    role: process.env.FIREBIRD_ROLE,
    lowercaseKeys: process.env.FIREBIRD_LOWERCASE_KEYS === 'true',
    retryConnectionInterval: getEnvNumber('FIREBIRD_RETRY_INTERVAL_MS', '0'),
    poolSize: getEnvNumber('FIREBIRD_POOL_SIZE', '5'),
  },
};
