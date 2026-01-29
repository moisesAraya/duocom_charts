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

app.use(cors());
app.use(express.json());
app.use(rateLimitMiddleware);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.env });
});

app.use('/api', authRouter);
app.use('/api', apiKeyMiddleware, authJwtMiddleware, clienteConfigRouter);
app.use('/api', authJwtMiddleware, dashboardRouter);
app.use('/api', authJwtMiddleware, dashboardNewRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`API server listening on port ${config.port} (0.0.0.0)`);
});
