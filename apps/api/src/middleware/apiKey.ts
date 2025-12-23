import { RequestHandler } from 'express';
import { config } from '../config';

export const apiKeyMiddleware: RequestHandler = (req, res, next) => {
  if (!config.apiKey) {
    next();
    return;
  }

  const apiKeyHeader = req.headers['x-api-key'];
  const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  if (apiKey === config.apiKey) {
    next();
    return;
  }

  res.status(401).json({ success: false, message: 'Invalid API key' });
};
