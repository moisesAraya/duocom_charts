declare module 'node-firebird' {
  export interface AttachmentConfig {
    host?: string;
    port?: number;
    database: string;
    user: string;
    password: string;
    role?: string;
    lowercase_keys?: boolean;
    retryConnectionInterval?: number;
  }

  export interface Database {
    query(
      sql: string,
      params: unknown[],
      callback: (error: Error | null, result: unknown) => void
    ): void;
    detach(): void;
  }

  export interface Pool {
    get(callback: (error: Error | null, db: Database) => void): void;
    destroy(): void;
  }

  export function pool(size: number, options: AttachmentConfig): Pool;
  export function attach(
    options: AttachmentConfig,
    callback: (error: Error | null, db: Database) => void
  ): void;

  const nodeFirebird: {
    pool: typeof pool;
    attach: typeof attach;
  };

  export default nodeFirebird;
}
