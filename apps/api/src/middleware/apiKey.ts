import { RequestHandler } from 'express';
import { config } from '../config';

// Middleware deshabilitado temporalmente para desarrollo
export const apiKeyMiddleware: RequestHandler = (req, res, next) => {
  next();
};
