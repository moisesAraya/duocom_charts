import cors from 'cors';
import express from 'express';
import { config } from './config';
import { apiKeyMiddleware } from './middleware/apiKey';
import dashboardRouter from './routes/dashboard';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: config.env });
});

app.use('/api', apiKeyMiddleware, dashboardRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on port ${config.port}`);
});
