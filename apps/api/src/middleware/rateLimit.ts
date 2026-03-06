/**
 * rateLimit.ts — Middleware de rate limiting (limitación de velocidad).
 *
 * Limita a 1000 peticiones por IP cada 15 minutos.
 * Usa un Map en memoria — adecuado para una sola instancia.
 * Si se supera el límite, responde con HTTP 429 (Too Many Requests).
 */

import { RequestHandler } from 'express';

/** Registro de conteo de peticiones por IP */
interface RateLimitEntry {
  count: number;
  /** Timestamp en el que se reinicia el conteo */
  resetAt: number;
}

/** Ventana de tiempo: 15 minutos en milisegundos */
const WINDOW_MS = 15 * 60 * 1000;

/** Máximo de peticiones permitidas por IP en la ventana */
const MAX_REQUESTS = 1000;

/** Almacén en memoria de contadores por IP */
const entries = new Map<string, RateLimitEntry>();

export const rateLimitMiddleware: RequestHandler = (req, res, next) => {
  const key = req.ip ?? 'unknown';
  const now = Date.now();
  const entry = entries.get(key);

  // Primera petición o ventana expirada — reiniciar contador
  if (!entry || now > entry.resetAt) {
    entries.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  // Límite excedido — responder 429
  if (entry.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfterSeconds.toString());
    res.status(429).json({ success: false, message: 'Rate limit exceeded' });
    return;
  }

  // Incrementar contador y continuar
  entry.count += 1;
  next();
};
