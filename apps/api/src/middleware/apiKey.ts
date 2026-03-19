/**
 * apiKey.ts — Middleware de validación de API Key.
 *
 * Verifica que el header 'x-api-key' contenga la clave correcta.
 * Protege endpoints públicos (validar-rut, login) para que solo
 * aplicaciones autorizadas puedan usarlos.
 *
 * Excepciones (públicas sin validación):
 *  - POST /api/validar-token (validación inicial por token)
 *  - GET /health
 *
 * TODO: Actualmente solo se habilita parcialmente para desarrollo.
 *       Descomentar la validación completa antes de ir a producción.
 */

import { RequestHandler } from 'express';
import { config } from '../config';

export const apiKeyMiddleware: RequestHandler = (req, res, next) => {
  // Endpoints públicos que NO requieren API key
  const publicEndpoints = [
    '/api/validar-token',  // Validación inicial de token (nueva)
    // Otros endpoints pueden agregarse aquí
  ];
  
  const isPublicEndpoint = publicEndpoints.some(endpoint => 
    req.path.endsWith(endpoint) || req.url.includes(endpoint)
  );
  
  if (isPublicEndpoint) {
    // Estos endpoints son públicos, permitir el acceso
    next();
    return;
  }
  
  // Para otros endpoints que requieren API key
  // TODO: Habilitar validación antes de producción
  // const apiKey = req.headers['x-api-key'];
  // if (!apiKey || apiKey !== config.apiKey) {
  //   res.status(401).json({ success: false, error: 'API key inválida' });
  //   return;
  // }
  next();
};

