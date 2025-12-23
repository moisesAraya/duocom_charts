import Firebird, { AttachmentConfig, Database, Pool } from 'node-firebird';
import { config } from '../config';

const poolSize = config.firebird.poolSize;

const pool: Pool = Firebird.pool(poolSize, {
  host: config.firebird.host,
  port: config.firebird.port,
  database: config.firebird.database,
  user: config.firebird.user,
  password: config.firebird.password,
  role: config.firebird.role,
  lowercase_keys: config.firebird.lowercaseKeys,
  retryConnectionInterval: config.firebird.retryConnectionInterval,
} as AttachmentConfig);

const getConnection = async (): Promise<Database> =>
  new Promise((resolve, reject) => {
    pool.get((error, db) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(db);
    });
  });

const executeQuery = async <T = unknown>(
  db: Database,
  sql: string,
  params: unknown[]
): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result as T[]);
    });
  });

export const query = async <T = unknown>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> => {
  const db = await getConnection();

  try {
    return await executeQuery<T>(db, sql, params);
  } finally {
    db.detach();
  }
};

export const closePool = (): void => {
  pool.destroy();
};
