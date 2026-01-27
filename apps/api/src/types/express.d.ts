import 'express-serve-static-core';
import type { FirebirdConnectionConfig } from '../db/firebird';

declare module 'express-serve-static-core' {
  interface Request {
    dbConfig?: FirebirdConnectionConfig;
    user?: { rut: number | string };
  }
}
