import dotenv from 'dotenv';

dotenv.config();

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(getEnv('PORT', '3000'), 10),
  apiKey: getEnv('API_KEY', ''),
  databaseUrl: getEnv('DATABASE_URL', ''),
};
