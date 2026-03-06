/**
 * index.ts — Punto de entrada de la API.
 *
 * Inicializa el servidor Express con:
 *  - CORS habilitado (permite cualquier origen)
 *  - Body parser JSON
 *  - Rate limiting por IP
 *  - Rutas de autenticación (públicas)
 *  - Rutas protegidas por JWT (dashboard, cliente-config)
 *  - Manejador global de errores
 */

import cors from 'cors';
import express from 'express';
import { config } from './config';
import { authJwtMiddleware } from './middleware/authJwt';
import { apiKeyMiddleware } from './middleware/apiKey';
import { rateLimitMiddleware } from './middleware/rateLimit';
import authRouter from './routes/auth';
import clienteConfigRouter from './routes/cliente-config';
import dashboardRouter from './routes/dashboard';
import dashboardNewRouter from './routes/dashboard_new';

const app = express();

/* ── Middlewares globales ── */
app.use(cors());                  // Permite peticiones desde cualquier origen
app.use(express.json());          // Parsea body JSON
app.use(rateLimitMiddleware);     // 1000 req / 15 min por IP

/* ── Health check (público) ── */
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.env });
});

/* ── Rutas de autenticación (protegidas solo por API key) ── */
app.use('/api', authRouter);

/* ── Rutas de configuración del cliente (requiere API key + JWT) ── */
app.use('/api', apiKeyMiddleware, authJwtMiddleware, clienteConfigRouter);

/* ── Rutas del dashboard (requiere JWT) ── */
app.use('/api', authJwtMiddleware, dashboardRouter);
app.use('/api', authJwtMiddleware, dashboardNewRouter);

/* ── Manejador global de errores ── */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', error.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

/* ── Inicio del servidor ── */
app.listen(config.port, '0.0.0.0', () => {
  console.log(`[server] API listening on port ${config.port} (0.0.0.0)`);
});
